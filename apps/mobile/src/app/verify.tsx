import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import {
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  formatIndianMobile,
  toE164,
} from '@propittu/shared';
import { OtpInput } from '@/components/OtpInput';
import { Banner, Button } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { colors, space, typography } from '@/theme';

/**
 * OTP verification (PRODUCT_SPEC.md §11): 6-digit code, validation errors,
 * loading state, resend with cooldown, invalid- and expired-OTP handling.
 *
 * On success Supabase stores the session; the root layout's
 * Stack.Protected guard then moves the user into the app.
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string; sentAt?: string }>();
  const phone = params.phone ?? '';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [sentAt, setSentAt] = useState(() => Number(params.sentAt) || Date.now());
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!/^\d{10}$/.test(phone)) return <Redirect href="/login" />;

  const cooldown = Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000));

  const verify = async (token: string) => {
    if (inFlight.current || token.length !== OTP_LENGTH) return;
    inFlight.current = true;
    setVerifying(true);
    setError(null);
    setInfo(null);

    const { error: authError } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token,
      type: 'sms',
    });

    if (!authError) return; // Navigation happens via the session guard.

    inFlight.current = false;
    setVerifying(false);
    setCode('');

    // Supabase reports wrong and expired codes identically; elapsed time tells them apart.
    if (authError.code === 'otp_expired' || authError.status === 403) {
      const elapsed = (Date.now() - sentAt) / 1000;
      setError(
        elapsed > OTP_EXPIRY_SECONDS
          ? 'This code has expired. Tap "Resend OTP" to get a new one.'
          : 'That code is incorrect. Please check it and try again.',
      );
      return;
    }
    setError(authErrorMessage(authError));
  };

  const onChange = (value: string) => {
    setCode(value);
    if (error) setError(null);
    if (value.length === OTP_LENGTH) void verify(value);
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setInfo(null);
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: toE164(phone) });
    setResending(false);
    if (authError) {
      setError(authErrorMessage(authError));
      return;
    }
    setSentAt(Date.now());
    setNow(Date.now());
    setCode('');
    setInfo('A new code has been sent.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to change the number"
          style={styles.back}
        >
          <Icon name="back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.header}>
          <Text style={typography.title}>Verify your mobile number</Text>
          <View style={styles.sentTo}>
            <Text style={typography.small}>OTP sent to {formatIndianMobile(phone)}</Text>
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>Change</Text>
            </Pressable>
          </View>
        </View>

        <OtpInput value={code} onChange={onChange} error={!!error} disabled={verifying} />

        {error ? <Banner message={error} tone="danger" /> : null}
        {info ? <Banner message={info} tone="success" /> : null}

        <View style={styles.resend}>
          <Text style={typography.small}>Didn&apos;t receive it?</Text>
          {cooldown > 0 ? (
            <Text style={styles.cooldown}>Resend OTP in 0:{String(cooldown).padStart(2, '0')}</Text>
          ) : (
            <Pressable onPress={resend} disabled={resending} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{resending ? 'Sending…' : 'Resend OTP'}</Text>
            </Pressable>
          )}
        </View>

        <Button
          title="Verify"
          onPress={() => void verify(code)}
          loading={verifying}
          disabled={code.length !== OTP_LENGTH}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: space.xl, paddingTop: space.sm, gap: space.xl },
  back: { alignSelf: 'flex-start', padding: 4, marginLeft: -4 },
  header: { gap: space.sm },
  sentTo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  resend: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cooldown: { fontSize: 14, color: colors.textSubtle },
});
