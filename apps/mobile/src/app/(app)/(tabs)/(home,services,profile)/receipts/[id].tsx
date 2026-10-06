import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatPrice, ORDER_STATUS_LABELS, SUPPORT_EMAIL } from '@propittu/shared';
import { useOrder } from '@/api/support';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { accents, colors, space, typography } from '@/theme';

/** Payment receipt (M7): everything about one order and its payment. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: o, isPending, error, refetch } = useOrder(id);
  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const paid = o.status === 'paid';
  const rows: [string, string | null][] = [
    ['For', o.description],
    ['Order', o.reference],
    ['Date', formatDate(o.paid_at ?? o.created_at)],
    ['Paid with', o.payment?.method ? o.payment.method.toUpperCase() : null],
    ['Payment reference', o.payment?.provider_payment_ref ?? null],
    ['Refunded', o.refunded_paise > 0 ? formatPrice(o.refunded_paise) : null],
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: paid ? accents.teal.bg : accents.amber.bg }]}>
          <Icon
            name={paid ? 'success' : 'clock'}
            size={26}
            color={paid ? accents.teal.fg : accents.amber.fg}
          />
        </View>
        <Text style={styles.amount}>{formatPrice(o.amount_paise)}</Text>
        <Badge label={ORDER_STATUS_LABELS[o.status]} tone={paid ? 'success' : 'warning'} />
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
  amount: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  rows: { alignSelf: 'stretch', marginTop: space.md, gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  value: { flexShrink: 1, textAlign: 'right' },
  note: { textAlign: 'center' },
});
