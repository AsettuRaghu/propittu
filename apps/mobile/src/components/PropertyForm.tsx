import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { PROPERTY_TYPE_ACCENTS, PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { accents, colors, font, radius, shadow, space, typography, type Accent } from '@/theme';
import { TextField } from './Field';
import { Icon, type IconName } from './Icon';
import { IconTile } from './ui';

/**
 * Add / Edit property form (PRODUCT_SPEC.md §16): one scrolling form in
 * clear cards — type, name & address, size, land records, notes. Only type
 * and name are required ("Only essential information should be
 * mandatory"); identifiers are never forced (§16 Step 3).
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

/** A titled card used by the property form (and the screens around it). */
export function FormSection({
  icon,
  accent = 'indigo',
  title,
  subtitle,
  children,
}: {
  icon: IconName;
  accent?: Accent;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, shadow]}>
      <View style={styles.sectionHeader}>
        <IconTile icon={icon} accent={accent} size={34} />
        <View style={styles.flex}>
          <Text style={typography.heading} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={typography.small} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
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
      <FormSection icon="home" title="What kind of property?">
        <View style={styles.typeGrid}>
          {PROPERTY_TYPES.map((t) => {
            const selected = values.property_type === t;
            const accent = accents[PROPERTY_TYPE_ACCENTS[t]];
            return (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChange({ property_type: t })}
                style={[
                  styles.typeTile,
                  selected && { borderColor: accent.fg, backgroundColor: accent.bg },
                ]}
              >
                <Icon
                  name={PROPERTY_TYPE_ICONS[t]}
                  size={24}
                  color={selected ? accent.fg : colors.textMuted}
                />
                <Text
                  style={[styles.typeLabel, selected && { color: accent.fg }]}
                  numberOfLines={1}
                >
                  {PROPERTY_TYPE_LABELS[t].split(' / ')[0]}
                </Text>
                {selected ? (
                  <View style={[styles.tick, { backgroundColor: accent.fg }]}>
                    <Icon name="check" size={10} color="#FFFFFF" strokeWidth={3.5} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {errors.property_type ? <Text style={styles.error}>{errors.property_type}</Text> : null}
      </FormSection>

      <FormSection icon="pin" accent="teal" title="Name & address">
        <TextField
          label="Property name"
          placeholder="e.g. Hyderabad plot"
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
          hint="Tells us which services can reach this property"
          keyboardType="number-pad"
          maxLength={6}
          placeholder="500001"
          {...field('pincode')}
        />
      </FormSection>

      <FormSection icon="area" accent="sky" title="Size">
        <TextField
          label="Area"
          optional
          keyboardType="decimal-pad"
          placeholder="2400"
          {...field('area_value')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.units}
        >
          {AREA_UNITS.map((u) => {
            const selected = values.area_unit === u;
            return (
              <Pressable
                key={u}
                onPress={() => onChange({ area_unit: u })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.unit, selected && styles.unitSelected]}
              >
                <Text style={[styles.unitText, selected && styles.unitTextSelected]}>
                  {AREA_UNIT_LABELS[u]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {errors.area_unit ? <Text style={styles.error}>{errors.area_unit}</Text> : null}
      </FormSection>

      <FormSection
        icon="deed"
        accent="amber"
        title="Land records"
        subtitle="Optional — add whichever identifiers apply."
      >
        <TextField label="Survey number" optional {...field('survey_number')} />
        <TextField label="Plot / property number" optional {...field('property_number')} />
        <TextField label="Khata / property ID" optional {...field('khata_number')} />
      </FormSection>

      <FormSection icon="document" accent="slate" title="Notes">
        <TextField
          label="Anything worth remembering"
          optional
          multiline
          maxLength={2000}
          placeholder="e.g. Gate key with neighbour, boundary stones on the east side"
          {...field('notes')}
        />
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.xs,
  },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeTile: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeLabel: { fontSize: font(13), fontWeight: '700', color: colors.text },
  tick: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  units: { gap: space.sm },
  unit: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.surfaceMuted,
  },
  unitSelected: { borderColor: accents.sky.fg, backgroundColor: accents.sky.bg },
  unitText: { fontSize: font(14), fontWeight: '600', color: colors.text },
  unitTextSelected: { color: accents.sky.fg, fontWeight: '800' },
  error: { fontSize: font(13), color: colors.danger, fontWeight: '600' },
});
