import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatPrice, ORDER_DISPLAY_LABELS, SUPPORT_EMAIL, withoutCodes } from '@propittu/shared';
import { useOrder } from '@/api/support';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { accents, colors, font, space, typography } from '@/theme';

/** Payment receipt (M7): everything about one order and its payment. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: o, isPending, error, refetch } = useOrder(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const paid = o.status === 'paid';
  const failed = o.display_status === 'failed';
  const rows: [string, string | null][] = [
    ['For', withoutCodes(o.description)],
    ['Order', o.reference],
    [paid ? 'Paid on' : 'Started on', formatDate(o.paid_at ?? o.created_at)],
    [
      'Plan valid',
      o.period ? `${formatDate(o.period.starts_at)} – ${formatDate(o.period.ends_at)}` : null,
    ],
    ['Plan price', o.credit_paise > 0 ? formatPrice(o.list_price_paise) : null],
    ['Credit for unused plan', o.credit_paise > 0 ? `− ${formatPrice(o.credit_paise)}` : null],
    ['Paid with', o.payment?.method ? o.payment.method.toUpperCase() : null],
    ['Payment reference', o.payment?.provider_payment_ref ?? null],
    ['Refunded', o.refunded_paise > 0 ? formatPrice(o.refunded_paise) : null],
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: paid
                ? accents.teal.bg
                : failed
                  ? accents.slate.bg
                  : accents.amber.bg,
            },
          ]}
        >
          <Icon
            name={paid ? 'success' : failed ? 'close' : 'clock'}
            size={26}
            color={paid ? accents.teal.fg : failed ? accents.slate.fg : accents.amber.fg}
          />
        </View>
        <Text style={styles.amount}>{formatPrice(o.amount_paise)}</Text>
        <Badge
          label={ORDER_DISPLAY_LABELS[o.display_status]}
          tone={paid ? 'success' : failed ? 'neutral' : 'warning'}
        />
        {failed ? (
          <Text style={[typography.small, styles.note]}>
            This payment was not completed and you were not charged.
          </Text>
        ) : null}
        <View style={styles.rows}>
          {rows
            .filter((r): r is [string, string] => !!r[1])
            .map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={typography.small}>{label}</Text>
                <Text style={[typography.bodyStrong, styles.value]} numberOfLines={2}>
                  {value}
                </Text>
              </View>
            ))}
        </View>
      </Card>
      <Text style={[typography.caption, styles.note]}>
        Payments are processed by Razorpay. For a GST invoice or any question, write to{' '}
        {SUPPORT_EMAIL}.
      </Text>
      <Button
        title="Get help with this payment"
        variant="secondary"
        icon="support"
        onPress={() =>
          router.push({
            pathname: '/support/new',
            params: { category: 'plan_billing', subject: `Payment ${o.reference}` },
          })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  amount: { fontSize: font(30), fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  rows: { alignSelf: 'stretch', marginTop: space.md, gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  value: { flexShrink: 1, textAlign: 'right' },
  note: { textAlign: 'center' },
});
