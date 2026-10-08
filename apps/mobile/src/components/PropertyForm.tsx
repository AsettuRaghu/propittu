import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AREA_UNITS,
  AREA_UNIT_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  createPropertySchema,
  toFieldErrors,
  type AreaUnit,
  type Facing,
  type KhataType,
  type LandUse,
  type CreatePropertyData,
  type Property,
  type PropertyType,
} from '@propittu/shared';
import { usePincode } from '@/api/queries';
import { PROPERTY_TYPE_ICONS } from '@/lib/icons';
import { space } from '@/theme';
import { TextField } from './Field';
import { FormSection } from './FormSection';
import { PropertyMoreDetails } from './PropertyMoreDetails';
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
  // More details (strings in the form; converted on validation)
  purchase_price_inr: string;
  purchase_date: string;
  sellers: string;
  land_use: LandUse | null;
  khata_type: KhataType | null;
  approving_authority: string | null;
  rera_number: string;
  plot_dimensions: string;
  facing: Facing | null;
  corner_plot: YesNo | null;
  road_width_ft: string;
  loan_on_property: YesNo | null;
  boundary_north: string;
  boundary_south: string;
  boundary_east: string;
  boundary_west: string;
}

export type YesNo = 'yes' | 'no';
const toYesNo = (b: boolean | null): YesNo | null => (b === null ? null : b ? 'yes' : 'no');
const fromYesNo = (v: YesNo | null) => (v === null ? null : v === 'yes');
/** "₹ 42,00,000" or "42 lakh"-free digits → a number; '' → null. */
const toNumber = (v: string) => {
  const clean = v.replace(/[₹,\s]/g, '');
  return clean === '' ? null : Number(clean);
};

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
  purchase_price_inr: '',
  purchase_date: '',
  sellers: '',
  land_use: null,
  khata_type: null,
  approving_authority: null,
  rera_number: '',
  plot_dimensions: '',
  facing: null,
  corner_plot: null,
  road_width_ft: '',
  loan_on_property: null,
  boundary_north: '',
  boundary_south: '',
  boundary_east: '',
  boundary_west: '',
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
    purchase_price_inr: p.purchase_price_inr === null ? '' : String(p.purchase_price_inr),
    purchase_date: p.purchase_date ?? '',
    sellers: p.sellers ?? '',
    land_use: p.land_use,
    khata_type: p.khata_type,
    approving_authority: p.approving_authority,
    rera_number: p.rera_number ?? '',
    plot_dimensions: p.plot_dimensions ?? '',
    facing: p.facing,
    corner_plot: toYesNo(p.corner_plot),
    road_width_ft: p.road_width_ft === null ? '' : String(p.road_width_ft),
    loan_on_property: toYesNo(p.loan_on_property),
    boundary_north: p.boundary_north ?? '',
    boundary_south: p.boundary_south ?? '',
    boundary_east: p.boundary_east ?? '',
    boundary_west: p.boundary_west ?? '',
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
    purchase_price_inr: toNumber(v.purchase_price_inr),
    road_width_ft: toNumber(v.road_width_ft),
    corner_plot: fromYesNo(v.corner_plot),
    loan_on_property: fromYesNo(v.loan_on_property),
  });
  return result.success
    ? { data: result.data, errors: null }
    : { data: null, errors: toFieldErrors(result.error) };
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
  more = false,
}: {
  values: PropertyFormValues;
  errors: Record<string, string>;
  onChange: (patch: Partial<PropertyFormValues>) => void;
  /** Edit and review: also the purchase, land, site and boundary details. */
  more?: boolean;
}) {
  // The PIN code comes first: it decides which services reach the property,
  // and from India's PIN directory it fills in the city and state.
  const pin = usePincode(values.pincode.trim());
  const found = pin.data ?? null;
  const pinMissing = /^[1-9][0-9]{5}$/.test(values.pincode.trim()) && pin.isFetched && !found;
  const pinHint = found
    ? `${found.place}, ${found.district}, ${found.state}`
    : 'Tells us which services can reach this property';
  useEffect(() => {
    if (!found) return;
    const patch: Partial<PropertyFormValues> = {};
    if (!values.city.trim()) patch.city = found.district;
    if (!values.state.trim()) patch.state = found.state;
    if (Object.keys(patch).length) onChange(patch);
    // Only when a new PIN is found; typing in City/State afterwards is left alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.pincode]);

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
        <TextField
          label="PIN code"
          hint={pinHint}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="560001"
          {...field('pincode')}
          error={
            errors.pincode ??
            (pinMissing ? 'We couldn’t find this PIN code — please check it' : undefined)
          }
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="City" optional autoCapitalize="words" {...field('city')} />
          </View>
          <View style={styles.flex}>
            <TextField label="State" optional autoCapitalize="words" {...field('state')} />
          </View>
        </View>
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

      {more ? <PropertyMoreDetails values={values} errors={errors} onChange={onChange} /> : null}

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
  row: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
});
