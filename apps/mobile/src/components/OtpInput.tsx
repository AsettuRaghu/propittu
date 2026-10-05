import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OTP_LENGTH } from '@propittu/shared';
import { colors, radius } from '@/theme';

/**
 * Six boxes backed by ONE transparent TextInput laid over them.
 *
 * A single input (rather than six) is what makes SMS autofill
 * (iOS oneTimeCode / Android sms-otp) and paste work naturally.
 */
export function OtpInput({
  value,
  onChange,
  error = false,
  disabled = false,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(value.length, OTP_LENGTH - 1);
        return (
          <View key={i} style={[styles.box, active && styles.boxActive, error && styles.boxError]}>
            <Text style={styles.digit}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel={`${OTP_LENGTH}-digit verification code`}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.85,
    maxWidth: 56,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.danger },
  digit: { fontSize: 24, fontWeight: '600', color: colors.text },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.011, // >0 so Android still delivers touches and autofill to it
    color: 'transparent',
  },
});
