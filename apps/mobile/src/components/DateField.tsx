import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, typography } from '@/theme';

/** Local calendar date as YYYY-MM-DD (what the API expects for dates). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Date input: the native compact picker on iOS, the system dialog on
 * Android. `value` null means "not chosen" (shown with a Choose button).
 */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  hint,
  clearable = false,
}: {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  hint?: string;
  clearable?: boolean;
}) {
  const initial = value ?? minimumDate ?? new Date();

  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(date);
      },
    });

  return (
    <View style={styles.field}>
      <Text style={typography.overline}>{label}</Text>
      <View style={styles.row}>
        {value === null ? (
          <Pressable
            onPress={() => (Platform.OS === 'android' ? openAndroid() : onChange(initial))}
            style={styles.choose}
            accessibilityRole="button"
          >
            <Text style={styles.chooseText}>Choose a date</Text>
          </Pressable>
        ) : Platform.OS === 'ios' ? (
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_e, date) => date && onChange(date)}
            accentColor={colors.primary}
            // The app is light-only; without this iOS renders it dark in dark mode.
            themeVariant="light"
          />
        ) : (
          <Pressable onPress={openAndroid} style={styles.choose} accessibilityRole="button">
            <Text style={styles.chooseText}>{value.toDateString()}</Text>
          </Pressable>
        )}
        {clearable && value !== null ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={typography.caption}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  choose: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chooseText: { fontSize: font(15), color: colors.text },
  clear: { fontSize: font(14), color: colors.primary, fontWeight: '600' },
});
