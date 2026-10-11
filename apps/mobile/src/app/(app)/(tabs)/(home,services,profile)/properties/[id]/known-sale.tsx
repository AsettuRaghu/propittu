import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AREA_BASIS_LABELS, knownSaleSchema, type AreaBasis } from '@propittu/shared';
import { useAddKnownSale } from '@/api/ai';
import { useProperty } from '@/api/queries';
import { DateField } from '@/components/DateField';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { FormSection } from '@/components/FormSection';
import { PropertyContext } from '@/components/PropertyContext';
import { Select } from '@/components/Select';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { parseRupees, rupeesShort } from '@/lib/format';
import { colors, space, typography } from '@/theme';

/**
 * "Know a recent sale in your building? Tell Pittu." A real sale beats
 * asking prices online: it counts in this property's value at once, and —
 * if the owner agrees — anonymously (no name, no flat number) for every
 * owner in the same project.
 */
export default function KnownSaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const property = useProperty(id).data;
  const add = useAddKnownSale(id);
  const flat = property?.property_type === 'apartment';
  const [price, setPrice] = useState('');
  const [area, setArea] = useState('');
  const [basis, setBasis] = useState<AreaBasis>(flat ? 'super_built_up' : 'plot');
  const [soldOn, setSoldOn] = useState<Date | null>(null);
  const [share, setShare] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  // Sales in the last six years count.
  const [range] = useState(() => ({
    max: new Date(),
    min: new Date(Date.now() - 6 * 365 * 86_400_000),
  }));
  const amount = parseRupees(price);

  const send = () => {
    setProblem(null);
    const parsed = knownSaleSchema.safeParse({
      price_inr: amount ?? undefined,
      area_sqft: Number(area.replace(/[^0-9]/g, '')) || undefined,
      area_basis: basis,
      sold_on: soldOn ? soldOn.toISOString().slice(0, 10) : undefined,
      share_in_project: share,
    });
    if (!parsed.success) {
      setProblem(
        !amount
          ? 'Enter the price, e.g. 2.7 Cr or 270 lakh'
          : !area
            ? 'Enter the area in sq ft'
            : !soldOn
              ? 'Choose about when it sold'
              : 'Check the details',
      );
      return;
    }
    add.mutate(parsed.data, {
      onSuccess: () => {
        toast('Thanks — Pittu has updated the value');
        router.back();
      },
      onError: (err) => setProblem(errorMessage(err)),
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <PropertyContext propertyId={id} />
        <Text style={typography.small}>
          A real sale in your building is the best guide to what your home is worth — better than
          asking prices online. Tell Pittu what you know.
        </Text>
        <FormSection title="The sale">
          <TextField
            variant="flat"
            label={amount ? `Price · ${rupeesShort(amount)}` : 'Price'}
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 2.7 Cr"
          />
          <TextField
            variant="flat"
            label="Area (sq ft)"
            value={area}
            onChangeText={setArea}
            keyboardType="number-pad"
            placeholder={flat ? 'e.g. 2030' : 'e.g. 1200'}
          />
          <Select
            variant="flat"
            label="That area is"
            value={basis}
            options={(Object.keys(AREA_BASIS_LABELS) as AreaBasis[]).map((b) => ({
              value: b,
              label: AREA_BASIS_LABELS[b],
            }))}
            onChange={(b) => b && setBasis(b)}
          />
          <DateField
            label="About when it sold"
            value={soldOn}
            onChange={setSoldOn}
            maximumDate={range.max}
            minimumDate={range.min}
          />
        </FormSection>
        <View style={styles.share}>
          <View style={styles.flex}>
            <Text style={typography.bodyStrong}>Help other owners in the project</Text>
            <Text style={typography.small}>
              Pittu uses it, without your name or flat number, for other owners’ values too.
            </Text>
          </View>
          <Switch value={share} onValueChange={setShare} trackColor={{ true: colors.primary }} />
        </View>
        {problem ? <Banner message={problem} /> : null}
      </ScrollView>
      <Footer>
        <Button title="Tell Pittu" icon="sparkles" onPress={send} loading={add.isPending} />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  share: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
