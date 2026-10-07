import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, font, radius, space, typography } from '@/theme';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  /**
   * `flat`: no box or label row (a section heading names it) — just the text
   * on the page with a hairline under it that turns brand-coloured when focused.
   */
  variant?: 'box' | 'flat';
};

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, error, hint, optional, multiline, onFocus, onBlur, variant = 'box', ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const flat = variant === 'flat';
  return (
    <View style={styles.wrap}>
      {flat ? null : (
        <Text style={styles.label}>
          {label}
          {optional ? <Text style={styles.optional}> · optional</Text> : null}
        </Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={
          flat
            ? [
                styles.flat,
                multiline && styles.flatMultiline,
                focused && styles.flatFocused,
                error ? styles.flatError : null,
              ]
            : [
                styles.input,
                multiline && styles.multiline,
                focused && styles.inputFocused,
                error ? styles.inputError : null,
              ]
        }
        {...input}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={typography.caption}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  flat: {
    fontSize: font(17),
    lineHeight: font(24),
    color: colors.text,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  flatMultiline: { minHeight: 110, textAlignVertical: 'top' },
  flatFocused: { borderBottomColor: colors.primary, borderBottomWidth: 1.5 },
  flatError: { borderBottomColor: colors.danger },
  label: { fontSize: font(13), fontWeight: '700', color: colors.textMuted },
  optional: { fontWeight: '500', color: colors.textSubtle },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: font(16),
    color: colors.text,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  error: { fontSize: font(13), color: colors.danger, fontWeight: '600' },
});
