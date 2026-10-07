import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { staffCan, type ReachDemand, type ServiceArea, type ServiceState } from '@propittu/shared';
import { useBoCoverage, useBoCoverageChange } from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, Banner, Button, Card, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, font, radius, space, typography } from '@/theme';

/**
 * Backoffice → Where we serve. Visit services reach properties whose PIN
 * code is in an active area; paperwork help reaches active states (state
 * from the PIN prefix). Demand shows where customers are waiting for us.
 */
export default function BackofficeAreasScreen() {
  const { data, isPending, error, refetch } = useBoCoverage();
  const me = useMe();
  const canEdit = staffCan(me.data?.staff_role, 'services.manage');

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      {!canEdit ? (
        <Banner tone="info" message="Your staff role can view but not change service areas." />
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Visit areas" subtitle="On-site services · by PIN code" />
        {data.areas.map((a) => (
          <AreaCard key={a.id} area={a} canEdit={canEdit} />
        ))}
        {canEdit ? <NewArea /> : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Paperwork states" subtitle="Paperwork help · by state" />
        <Card style={styles.card}>
          {data.states.map((s, i) => (
            <StateRow key={s.state} state={s} canEdit={canEdit} first={i === 0} />
          ))}
          {canEdit ? <NewState /> : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Waiting for us" subtitle="Properties outside our visit areas" />
        {data.demand.length === 0 ? (
          <Text style={typography.small}>Every property is inside a visit area.</Text>
        ) : (
          <Card style={styles.card}>
            {data.demand.map((d, i) => (
              <DemandRow
                key={d.pincode ?? 'none'}
                demand={d}
                areas={data.areas}
                canEdit={canEdit}
                first={i === 0}
              />
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function AreaCard({ area, canEdit }: { area: ServiceArea; canEdit: boolean }) {
  const change = useBoCoverageChange();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  const run = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) =>
    change.mutateAsync({ path, method, body }).catch((err) => {
      void dialog.alert({ title: "Couldn't save", message: errorMessage(err), tone: 'danger' });
      throw err;
    });

  const add = () =>
    run(`/areas/${area.id}/pincodes`, 'POST', { pincodes: input })
      .then(() => {
        setInput('');
        toast('PIN codes added');
      })
      .catch(() => undefined);

  const remove = async (pincode: string) => {
    const ok = await dialog.confirm({
      title: `Remove ${pincode}?`,
      message:
        'New visits there will no longer be bookable. Requests already made are not affected.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (ok) await run(`/areas/${area.id}/pincodes/${pincode}`, 'DELETE').catch(() => undefined);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>{area.name}</Text>
          <Text style={typography.small}>
            {area.state} · {area.pincodes.length} PIN codes
          </Text>
        </View>
        <Switch
          value={area.is_active}
          disabled={!canEdit || change.isPending}
          onValueChange={(v) =>
            void run(`/areas/${area.id}`, 'PATCH', { is_active: v }).catch(() => undefined)
          }
        />
      </View>
      {!area.is_active ? <Badge label="Paused — no visits bookable here" tone="warning" /> : null}
      <Button
        title={open ? 'Hide PIN codes' : 'Show PIN codes'}
        variant="ghost"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <View style={styles.pins}>
            {area.pincodes.map((p) => (
              <Pressable
                key={p}
                disabled={!canEdit}
                onPress={() => void remove(p)}
                accessibilityLabel={`Remove ${p}`}
                style={styles.pin}
              >
                <Text style={styles.pinText}>{p}</Text>
                {canEdit ? <Text style={styles.pinX}>×</Text> : null}
              </Pressable>
            ))}
          </View>
          {canEdit ? (
            <View style={styles.addRow}>
              <View style={styles.flex}>
                <TextField
                  label="Add PIN codes"
                  placeholder="560001, 560002"
                  keyboardType="numbers-and-punctuation"
                  value={input}
                  onChangeText={setInput}
                />
              </View>
              <Button
                title="Add"
                variant="secondary"
                loading={change.isPending}
                disabled={!input.trim()}
                onPress={() => void add()}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function NewArea() {
  const change = useBoCoverageChange();
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  return (
    <Card style={styles.card}>
      <Text style={typography.bodyStrong}>New area</Text>
      <TextField label="Name" placeholder="e.g. Mysuru" value={name} onChangeText={setName} />
      <TextField label="State" placeholder="e.g. Karnataka" value={state} onChangeText={setState} />
      <Button
        title="Create area"
        variant="secondary"
        loading={change.isPending}
        disabled={!name.trim() || !state.trim()}
        onPress={() =>
          change.mutate(
            { path: '/areas', method: 'POST', body: { name, state } },
            {
              onSuccess: () => {
                setName('');
                setState('');
                toast('Area created — now add its PIN codes');
              },
              onError: (err) =>
                void dialog.alert({
                  title: "Couldn't create",
                  message: errorMessage(err),
                  tone: 'danger',
                }),
            },
          )
        }
      />
    </Card>
  );
}

function StateRow({
  state,
  canEdit,
  first,
}: {
  state: ServiceState;
  canEdit: boolean;
  first: boolean;
}) {
  const change = useBoCoverageChange();
  return (
    <View style={[styles.row, !first && styles.border]}>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong}>{state.state}</Text>
        <Text style={typography.caption}>
          PIN codes starting {state.pincode_prefixes.join(', ') || '—'}
        </Text>
      </View>
      <Switch
        value={state.is_active}
        disabled={!canEdit || change.isPending}
        onValueChange={(v) =>
          change.mutate(
            {
              path: `/states/${encodeURIComponent(state.state)}`,
              method: 'PATCH',
              body: { is_active: v },
            },
            {
              onError: (err) =>
                void dialog.alert({
                  title: "Couldn't save",
                  message: errorMessage(err),
                  tone: 'danger',
                }),
            },
          )
        }
      />
    </View>
  );
}

function NewState() {
  const change = useBoCoverageChange();
  const [state, setState] = useState('');
  const [prefixes, setPrefixes] = useState('');
  return (
    <View style={[styles.newState, styles.border]}>
      <TextField
        label="Add a state"
        placeholder="e.g. Tamil Nadu"
        value={state}
        onChangeText={setState}
      />
      <TextField
        label="Its PIN code prefixes"
        placeholder="e.g. 60, 61, 62, 63, 64"
        hint="Used to tell the state from a property's PIN code"
        keyboardType="numbers-and-punctuation"
        value={prefixes}
        onChangeText={setPrefixes}
      />
      <Button
        title="Add state"
        variant="secondary"
        loading={change.isPending}
        disabled={!state.trim()}
        onPress={() =>
          change.mutate(
            {
              path: '/states',
              method: 'POST',
              body: { state, pincode_prefixes: prefixes.split(/[\s,;]+/).filter(Boolean) },
            },
            {
              onSuccess: () => {
                setState('');
                setPrefixes('');
                toast('State added');
              },
              onError: (err) =>
                void dialog.alert({
                  title: "Couldn't add",
                  message: errorMessage(err),
                  tone: 'danger',
                }),
            },
          )
        }
      />
    </View>
  );
}

function DemandRow({
  demand,
  areas,
  canEdit,
  first,
}: {
  demand: ReachDemand;
  areas: ServiceArea[];
  canEdit: boolean;
  first: boolean;
}) {
  const change = useBoCoverageChange();
  const pincode = demand.pincode;

  const addToArea = async () => {
    if (!pincode) return;
    const areaId =
      areas.length === 1
        ? areas[0]!.id
        : await dialog.actions({
            title: `Add ${pincode} to which area?`,
            actions: areas.map((a) => ({ label: a.name, value: a.id })),
          });
    if (!areaId) return;
    change.mutate(
      { path: `/areas/${areaId}/pincodes`, method: 'POST', body: { pincodes: [pincode] } },
      {
        onSuccess: () => toast(`${pincode} added — visits are now bookable there`),
        onError: (err) =>
          void dialog.alert({ title: "Couldn't add", message: errorMessage(err), tone: 'danger' }),
      },
    );
  };

  return (
    <View style={[styles.row, !first && styles.border]}>
      <View style={styles.flex}>
        <Text style={typography.bodyStrong}>
          {pincode ?? 'No PIN code'}
          {demand.place ? ` · ${demand.place}` : ''}
        </Text>
        <Text style={typography.caption}>
          {demand.properties} {demand.properties === 1 ? 'property' : 'properties'}
          {demand.interested ? ` · ${demand.interested} asked to be told` : ''}
        </Text>
      </View>
      {canEdit && pincode && areas.length > 0 ? (
        <Button
          title="Add"
          variant="secondary"
          loading={change.isPending}
          onPress={() => void addToArea()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.sm },
  card: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  border: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  pins: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  pinText: { fontSize: font(13), color: colors.text, fontVariant: ['tabular-nums'] },
  pinX: { fontSize: font(14), color: colors.textSubtle },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  newState: { gap: space.sm },
});
