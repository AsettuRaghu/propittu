import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AuditEntry } from '@propittu/shared';
import { useBoActivity } from '@/api/backoffice';
import { colors, radius, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Card, Segmented } from './ui';

const ACTOR: Record<AuditEntry['actor_type'], { label: string; icon: IconName }> = {
  user: { label: 'Customer', icon: 'user' },
  staff: { label: 'Staff', icon: 'staff' },
  provider: { label: 'Payment provider', icon: 'card' },
  system: { label: 'System', icon: 'bolt' },
};

const OPS: Record<string, string> = { insert: 'created', update: 'changed', delete: 'deleted' };

/** "staff.service_request.completed" → "Service request completed". */
function title(e: AuditEntry): string {
  const parts = e.action.split('.');
  if (parts[0] === 'db') {
    const table = (parts[1] ?? '').replace(/_/g, ' ').replace(/s$/, '');
    return `${table.charAt(0).toUpperCase()}${table.slice(1)} ${OPS[parts[2] ?? ''] ?? parts[2]}`;
  }
  const text = parts
    .filter((p) => p !== 'staff')
    .join(' ')
    .replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const short = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Backoffice: an account's audit trail — business events, or row-level changes. */
export function ActivityLog({ accountId }: { accountId: string }) {
  const [kind, setKind] = useState<'events' | 'changes'>('events');
  const { data, isPending } = useBoActivity(accountId, kind);

  return (
    <View style={styles.wrap}>
      <Segmented
        options={[
          { value: 'events', label: 'Actions' },
          { value: 'changes', label: 'Data changes' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {isPending ? (
        <Text style={typography.small}>Loading…</Text>
      ) : !data || data.length === 0 ? (
        <Text style={typography.small}>Nothing recorded yet.</Text>
      ) : (
        <Card style={styles.card}>
          {data.map((e, i) => {
            const a = ACTOR[e.actor_type];
            const changes = e.changes ? Object.entries(e.changes).slice(0, 4) : [];
            return (
              <View key={e.id} style={[styles.row, i > 0 && styles.border]}>
                <View style={styles.icon}>
                  <Icon name={a.icon} size={13} color={colors.textMuted} />
                </View>
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {title(e)}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {e.actor_name ?? a.label} · {stamp(e.created_at)}
                  </Text>
                  {changes.map(([k, [from, to]]) => (
                    <Text key={k} style={styles.change} numberOfLines={1}>
                      {k}: {short(from)} → {short(to)}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  card: { paddingVertical: space.xs },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: 9 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  icon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  flex: { flex: 1, minWidth: 0, gap: 1 },
  change: { fontSize: 11.5, color: colors.textMuted, fontFamily: 'Courier' },
});
