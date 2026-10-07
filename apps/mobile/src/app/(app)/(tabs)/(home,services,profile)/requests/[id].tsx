import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  canCustomerCancel,
  formatPrice,
  PAYMENT_TIMING_LABELS,
  PREFERRED_SLOT_LABELS,
  requestPayment,
  type RequestPayment,
  type ServiceRequestDetail,
} from '@propittu/shared';
import { showPaymentOutcome, useServiceCheckout } from '@/api/billing';
import { useCancelServiceRequest, useServiceRequest } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { OutcomeView } from '@/components/OutcomeView';
import { PullRefresh } from '@/components/PullRefresh';
import { RequestHero } from '@/components/RequestHero';
import { ErrorState, LoadingState } from '@/components/States';
import { VisitReportView } from '@/components/VisitReportView';
import { Button, IconTile, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { accents, colors, font, radius, space, typography, type Accent } from '@/theme';

/**
 * A service request that feels alive: a hero in the service's colours with
 * where things stand and the stages, anything you need to do (reply, pay)
 * as a clear call-out, the facts at a glance, what's included, our
 * updates, the result — and help (cancel only where this request allows).
 */
export default function ServiceRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: r, isPending, error, refetch } = useServiceRequest(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const payment = requestPayment(r);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <RequestHero request={r} />

      {r.status === 'awaiting_customer' ? (
        <Callout
          icon="chat"
          accent="coral"
          title="We need something from you"
          text={r.status_note ?? 'Reply so we can carry on — you can attach files.'}
          action={
            r.info_ticket ? (
              <Button
                title="Reply"
                icon="chat"
                onPress={() => router.push(`/support/${r.info_ticket?.id}`)}
              />
            ) : null
          }
        />
      ) : null}
      {payment.state === 'due' ? <PayCallout request={r} amount={payment.amount} /> : null}

      <Glance request={r} payment={payment} />

      {r.status_note && r.status !== 'awaiting_customer' ? (
        <ListGroup title="Update from our team" plain>
          <ListRow icon="chat" accent="indigo" title={r.status_note} subtitleLines={4} />
        </ListGroup>
      ) : null}

      {r.service.includes.length ? (
        <ListGroup title="What’s included" plain>
          <View style={styles.inner}>
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

/** Something for the customer to do, standing out from the page. */
function Callout({
  icon,
  accent,
  title,
  text,
  action,
}: {
  icon: IconName;
  accent: Accent;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const a = accents[accent];
  return (
    <View style={[styles.callout, { backgroundColor: a.bg }]}>
      <View style={styles.calloutTop}>
        <IconTile icon={icon} accent={accent} size={36} />
        <View style={styles.flex}>
          <Text style={[typography.bodyStrong, { color: a.fg }]}>{title}</Text>
          <Text style={typography.body}>{text}</Text>
        </View>
      </View>
      {action}
    </View>
  );
}

function PayCallout({ request, amount }: { request: ServiceRequestDetail; amount: number }) {
  const pay = useServiceCheckout(request.id);
  return (
    <Callout
      icon="card"
      accent="indigo"
      title={`${formatPrice(amount)} to pay`}
      text="Pay securely by UPI or card — then we get going."
      action={
        <Button
          title={`Pay ${formatPrice(amount)}`}
          icon="lock"
          loading={pay.isPending}
          onPress={() =>
            pay.mutate(undefined, {
              onSuccess: (order) => showPaymentOutcome(order, 'Thank you — we’ll get started.'),
              onError: (err) =>
                void dialog.alert({
                  title: "Couldn't start the payment",
                  message: errorMessage(err),
                  tone: 'danger',
                }),
            })
          }
        />
      }
    />
  );
}

/** "Within 3–5 days of confirming" → "3–5 days" (falls back to the usual days, then the text). */
function shortTimeline(s: { turnaround: string | null; expected_days: number | null }): string {
  const m = s.turnaround?.match(/(\d+\s*[–-]\s*\d+|\d+)\s+(?:working\s+)?(days?|weeks?)/i);
  if (m?.[1] && m[2]) return `${m[1].replace(/\s+/g, '')} ${m[2]}`;
  if (s.expected_days) return `${s.expected_days} days`;
  return s.turnaround ?? '';
}

/** The key facts as a row of icons rather than a list of labels. */
function Glance({
  request: r,
  payment,
}: {
  request: ServiceRequestDetail;
  payment: RequestPayment;
}) {
  const when = r.scheduled_for
    ? { label: 'Visit', value: formatDate(r.scheduled_for) }
    : r.preferred_date || r.preferred_slot
      ? {
          label: 'Preferred',
          value: [
            r.preferred_date ? formatDate(r.preferred_date) : null,
            r.preferred_slot ? PREFERRED_SLOT_LABELS[r.preferred_slot] : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }
      : r.service.turnaround || r.service.expected_days
        ? { label: 'Timeline', value: shortTimeline(r.service) }
        : null;
  const cost =
    payment.state === 'included'
      ? 'In your plan'
      : payment.state === 'quote_pending'
        ? 'On quote'
        : payment.state === 'paid'
          ? `Paid ${formatPrice(payment.amount)}`
          : payment.state === 'later'
            ? formatPrice(payment.amount)
            : payment.state === 'due'
              ? `${formatPrice(payment.amount)} due`
              : '—';
  const facts: {
    icon: IconName;
    accent: Accent;
    label: string;
    value: string;
    onPress?: () => void;
  }[] = [
    { icon: 'clock', accent: 'sky', label: 'Requested', value: formatDate(r.created_at) },
    ...(when ? [{ icon: 'calendar' as const, accent: 'teal' as const, ...when }] : []),
    {
      icon: 'rupee',
      accent: 'violet',
      label: payment.state === 'later' ? PAYMENT_TIMING_LABELS[payment.timing] : 'Cost',
      value: cost,
      onPress:
        payment.state === 'paid' ? () => router.push(`/receipts/${payment.orderId}`) : undefined,
    },
  ];
  return (
    <View style={styles.glance}>
      {facts.map((f) => (
        <View key={f.label} style={styles.fact}>
          <IconTile icon={f.icon} accent={f.accent} size={32} />
          <Text style={typography.caption} numberOfLines={1}>
            {f.label}
          </Text>
          <Text
            style={[styles.factValue, f.onPress && { color: colors.primary }]}
            numberOfLines={2}
            onPress={f.onPress}
          >
            {f.value}
          </Text>
        </View>
      ))}
    </View>
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

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs, gap: space.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  callout: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  calloutTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  glance: { flexDirection: 'row', gap: space.md },
  fact: { flex: 1, gap: 4, alignItems: 'center' },
  factValue: { fontSize: font(15), fontWeight: '700', color: colors.text, textAlign: 'center' },
});
