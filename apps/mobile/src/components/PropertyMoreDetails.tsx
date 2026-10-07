import { StyleSheet, View } from 'react-native';
import {
  APPROVING_AUTHORITIES,
  FACINGS,
  FACING_LABELS,
  KHATA_TYPES,
  KHATA_TYPE_LABELS,
  LAND_USES,
  LAND_USE_LABELS,
} from '@propittu/shared';
import { space } from '@/theme';
import { TextField } from './Field';
import { FormSection } from './FormSection';
import type { PropertyFormValues, YesNo } from './PropertyForm';
import { Select } from './Select';

const LAND_USE_OPTIONS = LAND_USES.map((v) => ({ value: v, label: LAND_USE_LABELS[v] }));
const KHATA_OPTIONS = KHATA_TYPES.map((v) => ({ value: v, label: KHATA_TYPE_LABELS[v] }));
const FACING_OPTIONS = FACINGS.map((v) => ({ value: v, label: FACING_LABELS[v] }));
const AUTHORITY_OPTIONS = APPROVING_AUTHORITIES.map((v) => ({ value: v as string, label: v }));
const YES_NO: { value: YesNo; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/**
 * More about the property — on Edit and on Pittu's review (the quick manual
 * Add stays short). Pittu fills the purchase and boundaries from the deed.
 * Only what applies is asked: Khata type in Karnataka, RERA for flats, plot
 * details for plots and houses. Everything is optional, and tapping a
 * chosen option again clears it.
 */
export function PropertyMoreDetails({
  values,
  errors,
  onChange,
}: {
  values: PropertyFormValues;
  errors: Record<string, string>;
  onChange: (patch: Partial<PropertyFormValues>) => void;
}) {
  const text = (key: keyof PropertyFormValues) => ({
    variant: 'flat' as const,
    value: values[key] as string,
    onChangeText: (t: string) => onChange({ [key]: t }),
    error: errors[key],
  });
  const flat = values.property_type === 'apartment';
  const site = !flat;
  const karnataka = /karnataka|^ka$/i.test(values.state.trim()) || /^5[6-9]/.test(values.pincode);

  return (
    <>
      <FormSection title="Purchase (optional)" subtitle="Helps us show how its value has moved.">
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField
              label="Price paid (₹)"
              keyboardType="number-pad"
              placeholder="4200000"
              {...text('purchase_price_inr')}
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Bought on"
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              {...text('purchase_date')}
            />
          </View>
        </View>
        <TextField label="Bought from" autoCapitalize="words" {...text('sellers')} />
      </FormSection>

      <FormSection title="Land and approvals (optional)">
        <Select
          variant="flat"
          label="Land use"
          placeholder="Choose"
          value={values.land_use}
          options={LAND_USE_OPTIONS}
          onChange={(v) => onChange({ land_use: v })}
          clearable
        />
        {karnataka ? (
          <Select
            variant="flat"
            label="Khata type"
            placeholder="Choose"
            value={values.khata_type}
            options={KHATA_OPTIONS}
            onChange={(v) => onChange({ khata_type: v })}
            clearable
          />
        ) : null}
        <Select
          variant="flat"
          label="Approved by"
          placeholder="Choose the authority"
          value={values.approving_authority}
          options={AUTHORITY_OPTIONS}
          onChange={(v) => onChange({ approving_authority: v })}
          clearable
        />
        {flat ? (
          <TextField label="RERA number" autoCapitalize="characters" {...text('rera_number')} />
        ) : null}
        <Select
          variant="flat"
          label="Loan on the property"
          placeholder="Choose"
          value={values.loan_on_property}
          options={YES_NO}
          onChange={(v) => onChange({ loan_on_property: v })}
          clearable
        />
      </FormSection>

      {site ? (
        <FormSection title="The site (optional)">
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField label="Plot size" placeholder="30 × 40 ft" {...text('plot_dimensions')} />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Road width (ft)"
                keyboardType="number-pad"
                placeholder="30"
                {...text('road_width_ft')}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Select
                variant="flat"
                label="Facing"
                placeholder="Choose"
                value={values.facing}
                options={FACING_OPTIONS}
                onChange={(v) => onChange({ facing: v })}
                clearable
              />
            </View>
            <View style={styles.flex}>
              <Select
                variant="flat"
                label="Corner plot"
                placeholder="Choose"
                value={values.corner_plot}
                options={YES_NO}
                onChange={(v) => onChange({ corner_plot: v })}
                clearable
              />
            </View>
          </View>
        </FormSection>
      ) : null}

      <FormSection title="Boundaries (optional)" subtitle="As your sale deed describes them.">
        <TextField label="North" {...text('boundary_north')} />
        <TextField label="South" {...text('boundary_south')} />
        <TextField label="East" {...text('boundary_east')} />
        <TextField label="West" {...text('boundary_west')} />
      </FormSection>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  flex: { flex: 1, minWidth: 0 },
});
