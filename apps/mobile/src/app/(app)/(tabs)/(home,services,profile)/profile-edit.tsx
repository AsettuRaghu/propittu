import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatIndianMobile, updateProfileSchema } from '@propittu/shared';
import { useMe } from '@/api/queries';
import { useUpdateProfile } from '@/api/support';
import { toast } from '@/components/Dialog';
import { TextField } from '@/components/Field';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, radius, space, typography } from '@/theme';

/** Edit profile: the name is editable; the mobile number is the verified login. */
export default function EditProfileScreen() {
  const { data: me, isPending, error, refetch } = useMe();
  if (isPending) return <LoadingState />;
  if (error || !me) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return <Form initialName={me.full_name ?? ''} phone={me.phone} />;
}

function Form({ initialName, phone }: { initialName: string; phone: string }) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const save = useUpdateProfile();
  const changed = name.trim() !== initialName.trim();

  const submit = () => {
    const parsed = updateProfileSchema.safeParse({ full_name: name });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    save.mutate(parsed.data, {
      onSuccess: () => {
        toast('Profile updated');
        router.back();
      },
    });
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {save.error ? <Banner message={errorMessage(save.error)} /> : null}
        <TextField
          label="Full name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setFieldError(undefined);
          }}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={120}
          placeholder="e.g. Raghu Varma"
          error={fieldError}
          autoFocus={!initialName}
        />
        <View style={styles.field}>
          <Text style={styles.label}>Mobile number</Text>
          <View style={styles.locked}>
            <Text style={[typography.body, styles.flex]}>{formatIndianMobile(phone)}</Text>
            <Icon name="lock" size={15} color={colors.textSubtle} />
          </View>
          <View style={styles.verified}>
            <Icon name="verified" size={13} color={colors.success} />
            <Text style={styles.verifiedText}>Verified via OTP · this is your login</Text>
          </View>
        </View>
      </ScrollView>
      <Footer>
        <Button
          title="Save changes"
          onPress={submit}
          loading={save.isPending}
          disabled={!changed}
        />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: '600', color: colors.success },
});
