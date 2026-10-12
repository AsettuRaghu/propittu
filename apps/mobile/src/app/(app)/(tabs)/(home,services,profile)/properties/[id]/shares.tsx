import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { DOCUMENT_TYPE_LABELS } from '@propittu/shared';
import { useCreateShare, useDocuments, useRevokeShare, useShares } from '@/api/queries';
import { dialog } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { PropertyContext } from '@/components/PropertyContext';
import { Banner, Button, ListGroup, ListRow, Segmented } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { colors, space, typography } from '@/theme';

const DAYS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
] as const;

/**
 * Share documents safely: a private link to the documents you choose, for
 * a lawyer, a bank or a buyer. It expires by itself, you can stop it any
 * time, and you see when it's opened.
 */
export default function SharesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const docs = useDocuments(id);
  const shares = useShares(id);
  const create = useCreateShare(id);
  const revoke = useRevokeShare(id);
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<'1' | '7' | '30'>('7');
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const toggle = (docId: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(docId)) n.delete(docId);
      else n.add(docId);
      return n;
    });
  const hasId = (docs.data ?? []).some((d) => chosen.has(d.id) && d.document_type === 'owner_id');

  const send = () => {
    setProblem(null);
    create.mutate(
      { label: label.trim(), document_ids: [...chosen], days: Number(days) as 1 | 7 | 30 },
      {
        onSuccess: ({ url }) => {
          setLabel('');
          setChosen(new Set());
          void Share.share({
            message: `Documents for you, shared with Propittu (valid ${DAYS.find((d) => d.value === days)!.label}): ${url}`,
          });
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  const active = (shares.data ?? []).filter((s) => !s.revoked_at && Date.parse(s.expires_at) > now);
  const past = (shares.data ?? []).filter((s) => !active.includes(s));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.small}>
        Send a private link instead of the files themselves. It stops working by itself, and you can
        stop it earlier.
      </Text>

      <ListGroup title="New link" plain>
        <View style={[styles.inner, styles.form]}>
          <TextField
            variant="flat"
            label="Who is it for?"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. My lawyer, SBI home loan, the buyer"
          />
          <Text style={typography.caption}>Documents to share</Text>
          {(docs.data ?? []).map((d) => (
            <Pressable
              key={d.id}
              onPress={() => toggle(d.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen.has(d.id) }}
              style={styles.check}
            >
              <View style={[styles.box, chosen.has(d.id) && styles.boxOn]}>
                {chosen.has(d.id) ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={typography.body}>{DOCUMENT_TYPE_LABELS[d.document_type]}</Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {d.file_name}
                </Text>
              </View>
            </Pressable>
          ))}
          <Text style={typography.caption}>Link works for</Text>
          <Segmented options={DAYS} value={days} onChange={setDays} />
          {hasId ? (
            <Banner
              tone="warning"
              message="You’re sharing an ID document — only send it to people you trust."
            />
          ) : null}
          {problem ? <Banner message={problem} /> : null}
          <Button
            title="Create link and share"
            icon="share"
            onPress={send}
            loading={create.isPending}
            disabled={!label.trim() || chosen.size === 0}
          />
        </View>
      </ListGroup>

      {active.length ? (
        <ListGroup title="Links that work now" plain>
          {active.map((s) => (
            <ListRow
              key={s.id}
              icon="share"
              accent="indigo"
              title={s.label}
              subtitle={`${s.document_count} document${s.document_count === 1 ? '' : 's'} · until ${formatDate(s.expires_at)} · ${
                s.opened
                  ? `opened ${s.opened}× (last ${formatDateTime(s.last_opened_at!)}), ${s.downloaded} download${s.downloaded === 1 ? '' : 's'}`
                  : 'not opened yet'
              }`}
              subtitleLines={3}
              right={
                <Button
                  title="Stop"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    void dialog
                      .confirm({
                        title: `Stop sharing with ${s.label}?`,
                        message: 'The link stops working at once.',
                        confirmLabel: 'Stop sharing',
                        tone: 'danger',
                      })
                      .then((ok) => (ok ? revoke.mutate(s.id) : undefined))
                  }
                />
              }
              onPress={() => void Share.share({ message: s.url })}
            />
          ))}
        </ListGroup>
      ) : null}

      {past.length ? (
        <ListGroup title="Ended" plain collapsible initiallyOpen={false}>
          {past.map((s) => (
            <ListRow
              key={s.id}
              icon="lock"
              accent="slate"
              title={s.label}
              subtitle={`${s.revoked_at ? 'Stopped' : 'Expired'} · opened ${s.opened}× · ${s.downloaded} download${s.downloaded === 1 ? '' : 's'}`}
            />
          ))}
        </ListGroup>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  form: { gap: space.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
