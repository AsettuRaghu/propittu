import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useBoReleaseSlot, useBoSlots } from '@/api/backoffice';
import { showAlert } from '@/lib/alert';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, space, typography } from '@/theme';
import { TextField } from './Field';
import { Badge, Button, Card } from './ui';

/**
 * Backoffice: the account's property slots this term. A deleted property
 * keeps its slot until the term ends; staff can free one case by case,
 * with a reason (recorded in the audit trail).
 */
export function SlotList({ accountId, canManage }: { accountId: string; canManage: boolean }) {
  const { data, isPending } = useBoSlots(accountId);
  const release = useBoReleaseSlot();
  const [freeing, setFreeing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (isPending) return <Text style={typography.small}>Loading…</Text>;
  if (!data || data.length === 0)
    return <Text style={typography.small}>No slots used this term.</Text>;

  const submit = (slotId: string) =>
    release.mutate(
      { slotId, reason: reason.trim() },
      {
        onSuccess: () => {
          setFreeing(null);
          setReason('');
        },
        onError: (err) => showAlert("Couldn't free the slot", errorMessage(err)),
      },
    );

  return (
    <Card style={styles.card}>
      {data.map((s, i) => (
        <View key={s.id} style={[styles.row, i > 0 && styles.border]}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <Text style={typography.bodyStrong}>{s.property_name}</Text>
              <Text style={typography.caption}>
                Since {formatDate(s.claimed_at)}
                {s.property_deleted_at ? ` · deleted ${formatDate(s.property_deleted_at)}` : ''}
              </Text>
              {s.released_at ? (
                <Text style={typography.caption}>Freed: {s.release_reason}</Text>
              ) : null}
            </View>
            <Badge
              label={
                s.released_at ? 'Freed' : s.property_deleted_at ? 'Deleted · counted' : 'In use'
              }
              tone={s.released_at ? 'neutral' : s.property_deleted_at ? 'warning' : 'success'}
            />
          </View>
          {canManage && !s.released_at ? (
            freeing === s.id ? (
              <View style={styles.form}>
                <TextField
                  label="Why free this slot?"
                  placeholder="e.g. Property sold — sale deed checked"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                />
                <View style={styles.buttons}>
                  <Button
                    title="Free slot"
                    size="sm"
                    onPress={() => submit(s.id)}
                    disabled={reason.trim().length < 3}
                    loading={release.isPending}
                  />
                  <Button
                    title="Cancel"
                    size="sm"
                    variant="ghost"
                    onPress={() => setFreeing(null)}
                  />
                </View>
              </View>
            ) : (
              <Button
                title="Free this slot"
                size="sm"
                variant="secondary"
                onPress={() => {
                  setReason('');
                  setFreeing(s.id);
                }}
              />
            )
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.xs },
  row: { paddingVertical: space.md, gap: space.sm },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  form: { gap: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
});
