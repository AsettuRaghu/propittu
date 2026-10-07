import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COUNTRY_CALLING_CODE, phoneLocalSchema, toE164 } from '@propittu/shared';
import { useSession } from '@/auth/SessionProvider';
import { Icon } from '@/components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Banner, Button } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { useSplashDone } from '@/lib/splash';
import { supabase } from '@/lib/supabase';
import { colors, font, gradients, radius, shadow, space, typography } from '@/theme';

/**
 * Login — Indian mobile number only (PRODUCT_SPEC.md §10, §13).
 * The +91 prefix is fixed and shown separately; users type 10 digits.
 */
export default function LoginScreen() {
  const { notice, clearNotice } = useSession();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const splashDone = useSplashDone();

  // Raise the keyboard only once the welcome splash is gone.
  useEffect(() => {
    if (!splashDone) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [splashDone]);

  const onChange = (text: string) => {
    // Accept pasted "+91 98765 43210" / "098765…" by keeping the last 10 digits.
    const digits = text.replace(/\D/g, '');
    setPhone(digits.length > 10 ? digits.slice(-10) : digits);
    if (error) setError(null);
  };

  const sendOtp = async () => {
    const parsed = phoneLocalSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid Indian mobile number');
      return;
    }

    setError(null);
    clearNotice();
    setSending(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: toE164(parsed.data),
      });
      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }
      router.push({
        pathname: '/verify',
        params: { phone: parsed.data, sentAt: String(Date.now()) },
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logo}
            >
              <Icon name="home" size={30} color="#FFFFFF" strokeWidth={2.2} />
            </LinearGradient>
            <Text style={styles.wordmark}>Propittu</Text>
            <Text style={styles.tagline}>Everything about your property, in one place.</Text>
          </View>

          <View style={[styles.form, shadow]}>
            {notice ? <Banner message={notice} tone="warning" /> : null}

            <Text style={typography.heading}>Enter your mobile number</Text>
            <Text style={typography.small}>We&apos;ll send you a 6-digit code by SMS.</Text>

            <View style={[styles.phoneRow, error ? styles.phoneRowError : null]}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>{COUNTRY_CALLING_CODE}</Text>
              </View>
              <TextInput
                ref={inputRef}
                value={phone}
                onChangeText={onChange}
                onSubmitEditing={sendOtp}
                placeholder="98765 43210"
                placeholderTextColor={colors.textSubtle}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                // Room for a pasted "+91 98765 43210"; onChange keeps the last 10 digits.
                maxLength={20}
                editable={!sending}
                accessibilityLabel="Mobile number"
                style={styles.phoneInput}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Send OTP"
              onPress={sendOtp}
              loading={sending}
              disabled={phone.length !== 10}
            />
          </View>

          <Text style={styles.footnote}>Indian (+91) mobile numbers only.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space.xl, justifyContent: 'center', gap: space.xxl },
  brand: { gap: space.sm, alignItems: 'center' },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  wordmark: { fontSize: font(34), fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
  tagline: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  form: {
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
  },
  phoneRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.surfaceMuted,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  phoneRowError: { borderColor: colors.danger },
  prefix: {
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  prefixText: { fontSize: font(18), fontWeight: '600', color: colors.text },
  phoneInput: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: space.lg,
    fontSize: font(20),
    letterSpacing: 1,
    color: colors.text,
  },
  error: { fontSize: font(14), color: colors.danger },
  footnote: { ...typography.caption, textAlign: 'center' },
});
