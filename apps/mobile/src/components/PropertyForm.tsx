import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { space, typography } from '@/theme';
import { TextField } from './Field';
import { Select } from './Select';

/**
 * Add / Edit property form (PRODUCT_SPEC.md §16), flat: headed sections with
 * flat fields. Type, name and PIN code are required; identifiers are never
 * forced (§16 Step 3).
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

/**
 * A form section in the flat style: a heading (and optional line), with the
 * fields indented beneath it like list entries.
 */
export function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={typography.heading}>{title}</Text>
        {subtitle ? <Text style={typography.small}>{subtitle}</Text> : null}
      </View>
      <View style={styles.fields}>{children}</View>
    </View>
  );
}

const TYPE_OPTIONS = PROPERTY_TYPES.map((t) => ({
  value: t,
  label: PROPERTY_TYPE_LABELS[t].split(' / ')[0] ?? t,
  icon: PROPERTY_TYPE_ICONS[t],
}));
const UNIT_OPTIONS = AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u] }));

/** Add / Edit / review: one flat form — type, name and address, size, land records, notes. */
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
    variant: 'flat' as const,
    value: values[key] as string,
    onChangeText: (text: string) => onChange({ [key]: text }),
    error: errors[key],
  });

  return (
    <View style={styles.form}>
      <FormSection title="What kind of property?">
        <Select
          variant="flat"
          label="Property type"
          placeholder="Choose the type"
          value={values.property_type}
          options={TYPE_OPTIONS}
          onChange={(v) => onChange({ property_type: v })}
          error={errors.property_type}
        />
      </FormSection>

      <FormSection title="Name and address">
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
          placeholder="560001"
          {...field('pincode')}
        />
      </FormSection>

      <FormSection title="Size">
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label="Area"
              optional
              keyboardType="decimal-pad"
              placeholder="2400"
              {...field('area_value')}
            />
          </View>
          <View style={styles.flex}>
            <Select
              variant="flat"
              label="Unit"
              placeholder="Choose"
              value={values.area_unit}
              options={UNIT_OPTIONS}
              onChange={(v) => onChange({ area_unit: v })}
              error={errors.area_unit}
            />
          </View>
        </View>
      </FormSection>

      <FormSection title="Land records (optional)" subtitle="Add whichever identifiers apply.">
        <TextField label="Survey number" {...field('survey_number')} />
        <TextField label="Plot / property number" {...field('property_number')} />
        <TextField label="Khata / property ID" {...field('khata_number')} />
      </FormSection>

      <FormSection title="Notes (optional)">
        <TextField
          label="Anything worth remembering"
          hideLabel
          multiline
          maxLength={2000}
          placeholder="e.g. Gate key with the neighbour, boundary stones on the east side"
          {...field('notes')}
        />
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.xl },
  section: { gap: space.md },
  // Fields sit 12 pt in from their heading, like list entries.
  fields: { gap: space.lg, paddingLeft: space.md },
  row: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
});
