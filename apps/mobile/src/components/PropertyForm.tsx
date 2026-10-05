import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AREA_UNITS,
  AREA_UNIT_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  createPropertySchema,
  toFieldErrors,
  type AreaUnit,
  type CreatePropertyData,
  type Property,
  type PropertyType,
} from '@propittu/shared';
import { PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { colors, radius, space, typography } from '@/theme';
import { TextField } from './Field';
import { Chips, SectionTitle } from './ui';

/**
 * Add / Edit property form (PRODUCT_SPEC.md §16).
 *
 * The four steps in §16 are presented as sections of ONE scrolling form
 * rather than a four-screen wizard: same information, a third of the
 * code, and no draft state carried between screens (docs/DECISIONS.md).
 * Only type and name are required — "Only essential information should
 * be mandatory" and identifiers are never forced (§16 Step 3).
 */

export interface PropertyFormValues {
  property_type: PropertyType | null;
  name: string;
  address_line: string;
  city: string;
  state: string;
  pincode: string;
  area_value: string;
  area_unit: AreaUnit | null;
  survey_number: string;
  property_number: string;
  khata_number: string;
  notes: string;
}

export const emptyPropertyForm: PropertyFormValues = {
  property_type: null,
  name: '',
  address_line: '',
  city: '',
  state: '',
  pincode: '',
  area_value: '',
  area_unit: null,
  survey_number: '',
  property_number: '',
  khata_number: '',
  notes: '',
};

export function propertyToForm(p: Property): PropertyFormValues {
  return {
    property_type: p.property_type,
    name: p.name,
    address_line: p.address_line ?? '',
    city: p.city ?? '',
    state: p.state ?? '',
    pincode: p.pincode ?? '',
    area_value: p.area_value === null ? '' : String(p.area_value),
    area_unit: p.area_unit,
    survey_number: p.survey_number ?? '',
    property_number: p.property_number ?? '',
    khata_number: p.khata_number ?? '',
    notes: p.notes ?? '',
  };
}

/** Runs the same zod schema the API enforces. */
export function validatePropertyForm(
  v: PropertyFormValues,
): { data: CreatePropertyData; errors: null } | { data: null; errors: Record<string, string> } {
  const area = v.area_value.trim().replace(/,/g, '');
  const result = createPropertySchema.safeParse({
    ...v,
    property_type: v.property_type ?? undefined,
    area_value: area === '' ? null : Number(area),
  });
  return result.success
    ? { data: result.data, errors: null }
    : { data: null, errors: toFieldErrors(result.error) };
}

export function PropertyForm({
  values,
  errors,
  onChange,
}: {
  values: PropertyFormValues;
  errors: Record<string, string>;
  onChange: (patch: Partial<PropertyFormValues>) => void;
}) {
  const field = (key: keyof PropertyFormValues) => ({
    value: values[key] as string,
    onChangeText: (text: string) => onChange({ [key]: text }),
    error: errors[key],
  });

  return (
    <View style={styles.form}>
      {/* Step 1 — Property type */}
      <View style={styles.section}>
        <SectionTitle title="Property type" />
        <View style={styles.typeGrid}>
          {PROPERTY_TYPES.map((t) => {
            const selected = values.property_type === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChange({ property_type: t })}
                style={[styles.typeTile, selected && styles.typeTileSelected]}
              >
                <Ionicons
                  name={PROPERTY_TYPE_ICONS[t]}
                  size={24}
                  color={selected ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[styles.typeLabel, selected && styles.typeLabelSelected]}
                  numberOfLines={2}
                >
                  {PROPERTY_TYPE_LABELS[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.property_type ? <Text style={styles.error}>{errors.property_type}</Text> : null}
      </View>

      {/* Step 2 — Basic information */}
      <View style={styles.section}>
        <SectionTitle title="Basic information" />
        <TextField
          label="Property name"
          placeholder="e.g. My Hyderabad Plot"
          autoCapitalize="words"
          maxLength={120}
          {...field('name')}
        />
        <TextField
          label="Address"
          optional
          placeholder="House / plot no., street, area"
          {...field('address_line')}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="City" optional autoCapitalize="words" {...field('city')} />
          </View>
          <View style={styles.flex}>
            <TextField label="State" optional autoCapitalize="words" {...field('state')} />
          </View>
        </View>
        <TextField
          label="PIN code"
          optional
          keyboardType="number-pad"
          maxLength={6}
          placeholder="500001"
          {...field('pincode')}
        />
        <TextField
          label="Area"
          optional
          keyboardType="decimal-pad"
          placeholder="2400"
          {...field('area_value')}
        />
        <Chips
          options={AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u] }))}
          value={values.area_unit}
          onChange={(u) => onChange({ area_unit: u })}
        />
        {errors.area_unit ? <Text style={styles.error}>{errors.area_unit}</Text> : null}
        <TextField
          label="Notes"
          optional
          multiline
          maxLength={2000}
          placeholder="Anything worth remembering about this property"
          {...field('notes')}
        />
      </View>

      {/* Step 3 — Property identification */}
      <View style={styles.section}>
        <SectionTitle title="Property identification" />
        <Text style={typography.small}>
          Optional. Different properties use different identifiers — add whatever applies.
        </Text>
        <TextField label="Survey Number" optional {...field('survey_number')} />
        <TextField label="Plot Number / Property Number" optional {...field('property_number')} />
        <TextField label="Khata / Property ID" optional {...field('khata_number')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.xl },
  section: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeTile: {
    width: '48.5%',
    flexGrow: 1,
    minHeight: 76,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  typeTileSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  typeLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
  typeLabelSelected: { color: colors.primary, fontWeight: '600' },
  error: { fontSize: 13, color: colors.danger },
});
