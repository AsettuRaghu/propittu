import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { URGENT_KINDS, URGENT_KIND_LABELS, type UrgentKind } from '@propittu/shared';
import { useLocalHelp, useSendUrgent } from '@/api/queries';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { PropertyContext } from '@/components/PropertyContext';
import { Banner, Button, Chips, ListGroup, ListRow } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { openDirections } from '@/lib/maps';
import { space, typography } from '@/theme';

const PLACE_LABEL = {
  police: 'Police station',
  fire: 'Fire station',
  hospital: 'Hospital',
  local_body: 'Municipal / ward office',
  sub_registrar: 'Sub-Registrar office',
} as const;

/**
 * Something's wrong at my property: a neighbour called about a leak, a
 * break-in, dumping… One tap sends our team urgently (marked urgent for
 * them); below, the helplines and the nearest police, fire, hospital and
 * offices, with directions.
 */
export default function UrgentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const help = useLocalHelp(id);
  const send = useSendUrgent(id);
  const [kind, setKind] = useState<UrgentKind | null>(null);
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const go = () => {
    if (!kind) return;
    setProblem(null);
    send.mutate(
      { kind, details: details.trim() },
      {
        onSuccess: (r) => {
          toast('Sent — our team will call you');
          router.replace(`/requests/${r.id}`);
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <PropertyContext propertyId={id} />
      <Text style={typography.small}>
        In danger right now? Call 112 first. Otherwise tell us what’s wrong and we’ll send someone
        as soon as we can.
      </Text>
      <ListGroup title="What’s wrong?" plain>
        <View style={[styles.inner, styles.form]}>
          <Chips
            options={URGENT_KINDS.map((k) => ({ value: k, label: URGENT_KIND_LABELS[k] }))}
            value={kind}
            onChange={(k) => setKind(k)}
          />
          <TextField
            variant="flat"
            label="Anything we should know (optional)"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
            placeholder="e.g. The neighbour says water is coming out under the door."
          />
          {problem ? <Banner message={problem} /> : null}
          <Button
            title="Send our team now"
            icon="warning"
            variant="danger"
            onPress={go}
            loading={send.isPending}
            disabled={!kind}
          />
          <Text style={typography.caption}>
            Uses a visit from your plan if one is left; otherwise it’s booked as an extra and we
            confirm the price with you.
          </Text>
        </View>
      </ListGroup>

      <ListGroup title="Call now" plain>
        {(help.data?.helplines ?? []).map((h) => (
          <ListRow
            key={h.label}
            icon="phone"
            accent="coral"
            title={h.label}
            detail={h.number}
            onPress={() => void Linking.openURL(`tel:${h.number.replace(/[^0-9]/g, '')}`)}
          />
        ))}
      </ListGroup>

      {help.data?.places.length ? (
        <ListGroup title="Nearby" plain>
          {help.data.places.map((p) => (
            <ListRow
              key={`${p.kind}-${p.name}`}
              icon={
                p.kind === 'hospital' ? 'support' : p.kind === 'police' ? 'shield' : 'government'
              }
              accent="slate"
              title={p.name}
              subtitle={`${PLACE_LABEL[p.kind]} · ${p.distance_km} km${p.phone ? ` · ${p.phone}` : ''}`}
              onPress={() =>
                p.phone
                  ? void Linking.openURL(`tel:${p.phone.replace(/[^0-9+]/g, '')}`)
                  : void openDirections(p.name, p.lat, p.lon)
              }
            />
          ))}
        </ListGroup>
      ) : help.isPending ? (
        <Text style={typography.caption}>Finding the nearest offices…</Text>
      ) : null}
      <Text style={typography.caption}>
        Nearby places from OpenStreetMap — check before you go.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  form: { gap: space.md },
});
