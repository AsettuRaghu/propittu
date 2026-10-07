import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  canCustomerCancel,
  formatPrice,
  PAYMENT_TIMING_LABELS,
  PREFERRED_SLOT_LABELS,
  requestExpectedBy,
  requestPayment,
  requestStatusLabel,
  type ServiceRequestDetail,
} from '@propittu/shared';
import { showPaymentOutcome, useServiceCheckout } from '@/api/billing';
import { useCancelServiceRequest, useServiceRequest } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { OutcomeView } from '@/components/OutcomeView';
import { PageHeader } from '@/components/PageHeader';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { VisitReportView } from '@/components/VisitReportView';
import { Badge, Button, KeyValue, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';

/**
 * A service request, flat like Profile: what and where, anything we need
 * from you, the details, payment, the steps, what's included, your notes,
 * the result — and help (cancel only where this request allows it).
 */
export default function ServiceRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, isPending, error, refetch } = useServiceRequest(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const expected = requestExpectedBy(r);
  const preferred = [
    r.preferred_date ? formatDate(r.preferred_date) : null,
    r.preferred_slot ? PREFERRED_SLOT_LABELS[r.preferred_slot] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <PageHeader
        title={r.service.name}
        badge={
          <Badge
            label={requestStatusLabel(r.status, r.fulfilment)}
            tone={STATUS_TONES[r.status]}
            size="lg"
          />
        }
        subtitle={r.property?.name ?? 'Property removed'}
      />

      {r.status === 'awaiting_customer' ? (
        <ListGroup title="We need something from you" plain>
          <View style={styles.inner}>
            {r.status_note ? <Text style={typography.body}>{r.status_note}</Text> : null}
            {r.info_ticket ? (
              <Button
                title="Reply"
                icon="chat"
                size="sm"
                onPress={() => router.push(`/support/${r.info_ticket?.id}`)}
              />
            ) : null}
          </View>
        </ListGroup>
      ) : r.status_note ? (
        <ListGroup title="Update from our team" plain>
          <View style={styles.inner}>
            <Text style={typography.body}>{r.status_note}</Text>
          </View>
        </ListGroup>
      ) : null}

      <ListGroup title="Details" plain>
        <View style={[styles.inner, styles.facts]}>
          <KeyValue label="Requested" value={formatDate(r.created_at)} />
          <KeyValue label="Preferred" value={preferred || null} />
          {r.status !== 'cancelled' && r.status !== 'completed' ? (
            <KeyValue
              label={r.scheduled_for ? 'Visit on' : 'Expected by'}
              value={expected ? formatDate(expected) : 'We’ll confirm a date with you'}
            />
          ) : null}
          {r.service.turnaround ? (
            <KeyValue label="Usually takes" value={r.service.turnaround} />
          ) : null}
        </View>
      </ListGroup>

      <Payment request={r} />

      <ListGroup title="Steps" plain>
        <View style={styles.inner}>
          <Steps request={r} />
        </View>
      </ListGroup>

      {r.service.includes.length ? (
        <ListGroup title="What’s included" plain>
          <View style={[styles.inner, styles.facts]}>
            {r.service.includes.map((line) => (
              <View key={line} style={styles.point}>
                <Icon name="check" size={16} color={colors.success} strokeWidth={2.5} />
                <Text style={[typography.body, styles.flex]}>{line}</Text>
              </View>
            ))}
          </View>
        </ListGroup>
      ) : null}

      {r.description ? (
        <ListGroup title="Your notes" plain>
          <View style={styles.inner}>
            <Text style={typography.body}>{r.description}</Text>
          </View>
        </ListGroup>
      ) : null}

      {r.report ? <VisitReportView report={r.report} /> : null}
      {r.outcome ? <OutcomeView outcome={r.outcome} /> : null}

      <Help request={r} />
    </ScrollView>
  );
}

/** Where the payment stands, and the Pay button when it's time. */
function Payment({ request: r }: { request: ServiceRequestDetail }) {
  const pay = useServiceCheckout(r.id);
  const p = requestPayment(r);
  if (p.state === 'none') return null;

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
    <ListGroup title="Payment" plain>
      {p.state === 'included' ? (
        <ListRow icon="success" accent="teal" title="Included in your plan" />
      ) : p.state === 'quote_pending' ? (
        <ListRow
          icon="rupee"
          accent="sky"
          title="Price on quote"
          subtitle="We’ll share the price here before any work starts"
          subtitleLines={2}
        />
      ) : p.state === 'later' ? (
        <ListRow
          icon="rupee"
          accent="sky"
          title={formatPrice(p.amount)}
          subtitle={PAYMENT_TIMING_LABELS[p.timing]}
        />
      ) : p.state === 'paid' ? (
        <ListRow
          icon="success"
          accent="teal"
          title={`Paid ${formatPrice(p.amount)}`}
          subtitle="View receipt"
          onPress={() => router.push(`/receipts/${p.orderId}`)}
        />
      ) : (
        <ListRow
          icon="card"
          accent="sky"
          title={`${formatPrice(p.amount)} to pay`}
          subtitle="Secure UPI or card payment"
          right={<Button title="Pay" size="sm" loading={pay.isPending} onPress={start} />}
        />
      )}
    </ListGroup>
  );
}

/** Contact support, and — only where this request allows it — cancel (no refunds). */
function Help({ request: r }: { request: ServiceRequestDetail }) {
  const cancel = useCancelServiceRequest(r.id);
  const paid = requestPayment(r).state === 'paid';

  const confirmCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Cancel this request?',
      message: paid
        ? 'Payments are not refunded when you cancel. You can book again any time.'
        : 'You can book again any time.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep it',
      tone: 'danger',
      icon: 'cancelled',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      // Straight back to My requests — no extra message.
      onSuccess: () => (router.canGoBack() ? router.back() : router.replace('/services')),
      onError: (err) =>
        void dialog.alert({ title: "Couldn't cancel", message: errorMessage(err), tone: 'danger' }),
    });
  };

  return (
    <ListGroup title="Need help?" plain>
      <ListRow
        icon="support"
        accent="teal"
        title="Contact support"
        onPress={() =>
          router.push({
            pathname: '/support/new',
            params: {
              requestId: r.id,
              category: 'service_request',
              subject: `${r.service.name}${r.property ? ` · ${r.property.name}` : ''}`,
            },
          })
        }
      />
      {canCustomerCancel(r) ? (
        <ListRow
          icon="cancelled"
          title={cancel.isPending ? 'Cancelling…' : 'Cancel request'}
          destructive
          showChevron={false}
          onPress={() => void confirmCancel()}
        />
      ) : null}
    </ListGroup>
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

/** The steps for this kind of request, with dates as they happen. */
function Steps({ request: r }: { request: ServiceRequestDetail }) {
  const s = r.status;
  const assistance = r.fulfilment === 'assistance';
  const order = assistance
    ? ['requested', 'confirmed', 'in_progress', 'completed']
    : ['requested', 'confirmed', 'scheduled', 'in_progress', 'completed'];
  // "Need info from you" sits on the "Working on it" step.
  const at = s === 'awaiting_customer' ? 'in_progress' : s;
  const reached = (k: string) => s !== 'cancelled' && order.indexOf(at) >= order.indexOf(k);
  const result = r.report ? ' · report below' : r.outcome ? ' · result below' : '';

  const steps: Step[] = [
    {
      key: 'requested',
      icon: 'clock',
      title: 'Requested',
      detail: formatDate(r.created_at),
      done: true,
    },
    {
      key: 'confirmed',
      icon: 'check',
      title: 'Accepted by our team',
      detail: r.confirmed_at ? formatDate(r.confirmed_at) : 'Usually within a working day',
      done: reached('confirmed'),
    },
    ...(assistance
      ? []
      : [
          {
            key: 'scheduled',
            icon: 'calendar' as const,
            title: 'Visit scheduled',
            detail: r.scheduled_for ? formatDate(r.scheduled_for) : null,
            done: reached('scheduled'),
          },
        ]),
    {
      key: 'in_progress',
      icon: s === 'awaiting_customer' ? 'chat' : 'bolt',
      title: assistance ? 'Working on it' : 'Visit in progress',
      detail: s === 'awaiting_customer' ? 'Waiting for your reply' : null,
      done: reached('in_progress'),
    },
    {
      key: 'completed',
      icon: 'success',
      title: 'Completed',
      detail: r.completed_at ? `${formatDate(r.completed_at)}${result}` : null,
      done: reached('completed'),
    },
  ];
  if (s === 'cancelled') {
    steps.splice(1, steps.length - 1, {
      key: 'cancelled',
      icon: 'cancelled',
      title: r.cancelled_by === 'customer' ? 'Cancelled by you' : 'Cancelled',
      detail: r.cancelled_at ? formatDate(r.cancelled_at) : null,
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
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs, gap: space.md },
  facts: { gap: space.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
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
});
