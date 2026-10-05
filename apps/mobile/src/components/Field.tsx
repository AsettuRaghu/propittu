import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, space, typography } from '@/theme';

type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, error, hint, optional, multiline, onFocus, onBlur, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
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
        style={[
          styles.input,
          multiline && styles.multiline,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
        ]}
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
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  optional: { fontWeight: '400', color: colors.textSubtle },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 13, color: colors.danger },
});
