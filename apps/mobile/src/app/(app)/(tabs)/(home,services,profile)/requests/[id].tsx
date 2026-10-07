import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatPrice,
  PREFERRED_SLOT_LABELS,
  requestStatusLabel,
  type ServiceRequestDetail,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { showPaymentOutcome, useServiceCheckout } from '@/api/billing';
import { useCancelServiceRequest, useServiceRequest } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card, IconTile, SectionTitle } from '@/components/ui';
import { OutcomeView } from '@/components/OutcomeView';
import { VisitReportView } from '@/components/VisitReportView';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { serviceVisual, STATUS_ICONS, STATUS_TONES } from '@/lib/icons';
import { accents, colors, font, space, typography } from '@/theme';

/**
 * Service request (M4): what, where, its timeline step by step, the cost
 * and payment, and — once completed — the visit report.
 */
export default function ServiceRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: request, isPending, error, refetch } = useServiceRequest(id);
  const cancel = useCancelServiceRequest(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const v = serviceVisual(request.service.code, request.service.category);

  const confirmCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Cancel this request?',
      message: 'You can always book again later.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep it',
      tone: 'danger',
      icon: 'cancelled',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      onSuccess: () => toast('Request cancelled', 'info'),
      onError: (err) =>
        void dialog.alert({ title: "Couldn't cancel", message: errorMessage(err), tone: 'danger' }),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      {/* Hero */}
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <IconTile icon={v.icon} accent={v.accent} size={52} />
          <View style={styles.flex}>
            <Text style={typography.title} numberOfLines={1}>
              {request.service.name}
            </Text>
            <Text style={typography.small} numberOfLines={1}>
              {request.property?.name ?? 'Property removed'} · {formatDate(request.created_at)}
            </Text>
          </View>
        </View>
        <View style={styles.heroRow}>
          <Badge
            label={requestStatusLabel(request.status, request.fulfilment)}
            tone={STATUS_TONES[request.status]}
            icon={STATUS_ICONS[request.status]}
          />
          <Text style={styles.cost}>{costLabel(request)}</Text>
        </View>
        {request.status_note && request.status !== 'awaiting_customer' ? (
          <View style={styles.note}>
            <Icon name="chat" size={16} color={colors.primary} />
            <Text style={[typography.body, styles.flex]}>{request.status_note}</Text>
          </View>
        ) : null}
      </Card>

      {request.status === 'awaiting_customer' ? <NeedsYou request={request} /> : null}

      <PaymentCard request={request} />

      <View>
        <SectionTitle title="Progress" />
        <Card>
          <Timeline request={request} />
        </Card>
      </View>

      {request.description ? (
        <View>
          <SectionTitle title="Your notes" />
          <Card>
            <Text style={typography.body}>{request.description}</Text>
          </Card>
        </View>
      ) : null}

      {request.report ? <VisitReportView report={request.report} /> : null}
      {request.outcome ? <OutcomeView outcome={request.outcome} /> : null}

      <View style={styles.actions}>
        {request.status === 'requested' ? (
          <Button
            title="Cancel request"
            variant="outline"
            onPress={() => void confirmCancel()}
            style={styles.flex}
          />
        ) : null}
        <Button
          title="Contact support"
          variant="secondary"
          icon="support"
          style={styles.flex}
          onPress={() =>
            router.push({
              pathname: '/support/new',
              params: {
                requestId: request.id,
                category: 'service_request',
                subject: `${request.service.name}${request.property ? ` · ${request.property.name}` : ''}`,
              },
            })
          }
        />
      </View>
    </ScrollView>
  );
}

function costLabel(r: ServiceRequestDetail): string {
  if (r.coverage === 'included') return 'Included in plan';
  return r.price_paise !== null ? formatPrice(r.price_paise) : 'On quote';
}

/** Extra Services: pay only after Propittu confirms (no refunds for unconfirmed slots). */
function PaymentCard({ request }: { request: ServiceRequestDetail }) {
  const pay = useServiceCheckout(request.id);
  if (
    request.coverage !== 'extra' ||
    request.price_paise === null ||
    request.status === 'cancelled'
  ) {
    return null;
  }
  const price = formatPrice(request.price_paise);

  if (request.order?.status === 'paid') {
    const orderId = request.order.id;
    return (
      <Pressable
        onPress={() => router.push(`/receipts/${orderId}`)}
        accessibilityRole="button"
        style={[styles.payBox, { backgroundColor: accents.teal.bg }]}
      >
        <Icon name="success" size={22} color={accents.teal.fg} />
        <View style={styles.flex}>
          <Text style={[styles.payTitle, { color: accents.teal.fg }]}>Paid {price}</Text>
          <Text style={typography.small}>View receipt</Text>
        </View>
        <Icon name="chevron" size={18} color={accents.teal.fg} />
      </Pressable>
    );
  }

  if (request.status === 'requested') {
    return (
      <View style={[styles.payBox, { backgroundColor: accents.sky.bg }]}>
        <Icon name="wallet" size={22} color={accents.sky.fg} />
        <View style={styles.flex}>
          <Text style={[styles.payTitle, { color: accents.sky.fg }]}>
            {price} · pay after we confirm
          </Text>
          <Text style={typography.small}>
            Nothing to pay yet. We&apos;ll confirm the slot first.
          </Text>
        </View>
      </View>
    );
  }

  const start = () =>
    pay.mutate(undefined, {
      onSuccess: (order) => showPaymentOutcome(order, 'Thank you — we’ll get started.'),
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't start the payment",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });

  return (
    <Card style={styles.payCard}>
      <View style={styles.payRow}>
        <IconTile icon="card" accent="sky" size={40} />
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>
            {request.fulfilment === 'assistance'
              ? 'We’ve accepted your request'
              : 'Your visit is confirmed'}
          </Text>
          <Text style={typography.small}>Pay {price} securely by UPI or card.</Text>
        </View>
      </View>
      <Button title={`Pay ${price}`} icon="lock" onPress={start} loading={pay.isPending} />
    </Card>
  );
}

/** "Need info from you": what Propittu asked, and one tap to reply (with files). */
function NeedsYou({ request }: { request: ServiceRequestDetail }) {
  const ticket = request.info_ticket;
  return (
    <Card style={styles.needs}>
      <View style={styles.payRow}>
        <IconTile icon="chat" accent="coral" size={40} />
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>We need something from you</Text>
          <Text style={typography.small}>Reply so we can carry on — you can attach files.</Text>
        </View>
      </View>
      {request.status_note ? (
        <View style={styles.ask}>
          <Text style={typography.body}>{request.status_note}</Text>
        </View>
      ) : null}
      {ticket ? (
        <Button title="Reply" icon="chat" onPress={() => router.push(`/support/${ticket.id}`)} />
      ) : null}
    </Card>
  );
}

interface Step {
  key: string;
  icon: IconName;
  title: string;
  detail?: string | null;
  done: boolean;
  current?: boolean;
}

function Timeline({ request }: { request: ServiceRequestDetail }) {
  const s = request.status;
  const assistance = request.fulfilment === 'assistance';
  const order = assistance
    ? ['requested', 'confirmed', 'in_progress', 'completed']
    : ['requested', 'confirmed', 'scheduled', 'in_progress', 'completed'];
  // "Need info from you" sits on the "Working on it" step.
  const at = s === 'awaiting_customer' ? 'in_progress' : s;
  const reached = (k: string) => s !== 'cancelled' && order.indexOf(at) >= order.indexOf(k);
  const when = [
    request.preferred_date ? formatDate(request.preferred_date) : null,
    request.preferred_slot ? PREFERRED_SLOT_LABELS[request.preferred_slot] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const result = request.report ? ' · report below' : request.outcome ? ' · outcome below' : '';

  const steps: Step[] = [
    {
      key: 'requested',
      icon: 'clock',
      title: 'Requested',
      detail: `${formatDate(request.created_at)}${when ? ` · preferred ${when}` : ''}`,
      done: true,
    },
    {
      key: 'confirmed',
      icon: 'check',
      title: 'Accepted by our team',
      detail: request.confirmed_at ? formatDate(request.confirmed_at) : 'Usually within a day',
      done: reached('confirmed'),
    },
    ...(assistance
      ? []
      : [
          {
            key: 'scheduled',
            icon: 'calendar' as const,
            title: 'Visit scheduled',
            detail: request.scheduled_for ? formatDate(request.scheduled_for) : null,
            done: reached('scheduled'),
          },
        ]),
    {
      key: 'in_progress',
      icon: s === 'awaiting_customer' ? 'chat' : 'bolt',
      title: assistance ? 'Working on it' : 'In progress',
      detail:
        s === 'awaiting_customer'
          ? 'Waiting for your reply'
          : s === 'in_progress'
            ? 'Our team is on it'
            : null,
      done: reached('in_progress'),
    },
    {
      key: 'completed',
      icon: 'success',
      title: 'Completed',
      detail: request.completed_at ? `${formatDate(request.completed_at)}${result}` : null,
      done: reached('completed'),
    },
  ];
  if (s === 'cancelled') {
    steps.splice(1, steps.length - 1, {
      key: 'cancelled',
      icon: 'cancelled',
      title: request.cancelled_by === 'customer' ? 'Cancelled by you' : 'Cancelled',
      detail: request.cancelled_at ? formatDate(request.cancelled_at) : null,
      done: true,
    });
  }
  const firstPending = steps.findIndex((x) => !x.done);
  if (firstPending >= 0) steps[firstPending] = { ...steps[firstPending], current: true } as Step;

  return (
    <View>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const color =
          step.key === 'cancelled'
            ? colors.textMuted
            : step.done
              ? colors.primary
              : colors.borderStrong;
        return (
          <View key={step.key} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { borderColor: color },
                  step.done && { backgroundColor: color },
                  step.current && styles.dotCurrent,
                ]}
              >
                {step.done ? (
                  <Icon name={step.icon} size={12} color="#FFFFFF" strokeWidth={3} />
                ) : null}
              </View>
              {!last ? (
                <View
                  style={[styles.line, steps[i + 1]?.done && { backgroundColor: colors.primary }]}
                />
              ) : null}
            </View>
            <View style={[styles.stepBody, !last && { paddingBottom: space.lg }]}>
              <Text
                style={[
                  typography.bodyStrong,
                  !step.done && !step.current && { color: colors.textSubtle },
                ]}
              >
                {step.title}
              </Text>
              {step.detail ? <Text style={typography.small}>{step.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  hero: { gap: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cost: { fontSize: font(15), fontWeight: '800', color: colors.text },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
  },
  payBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: 20,
  },
  payTitle: { fontSize: font(15), fontWeight: '800' },
  payCard: { gap: space.md },
  needs: { gap: space.md, borderWidth: 1.5, borderColor: accents.coral.fg },
  ask: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: space.md },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: { borderColor: colors.primary, borderWidth: 3 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepBody: { flex: 1, gap: 2, paddingTop: 2 },
  cancel: { alignItems: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
});
