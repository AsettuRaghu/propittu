import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_PHOTOS_AT_CREATION } from '@propittu/shared';
import {
  useAccountPlan,
  useCreateProperty,
  useInvalidateProperty,
  useMe,
  useProperties,
} from '@/api/queries';
import { formatDate } from '@/lib/format';
import { AddPropertyChoice, PropertyLimitReached } from '@/components/AddPropertyChoice';
import { preparePhoto, uploadPhoto } from '@/api/uploads';
import { Footer } from '@/components/Footer';
import { Icon } from '@/components/Icon';
import {
  FormSection,
  PropertyForm,
  emptyPropertyForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { Banner, Button, ProgressBar } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { pickPhotos } from '@/lib/pickPhotos';
import { accents, colors, font, radius, space, typography } from '@/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'uploading'; index: number; total: number; progress: number };

/**
 * Add Property (PRODUCT_SPEC.md §16). On Save the property is created
 * first, then any photos upload against it — the storage path needs the
 * new property's id. A failed photo never loses the property.
 */
export default function AddPropertyScreen() {
  const me = useMe();
  const account = useAccountPlan();
  const { manual } = useLocalSearchParams<{ manual?: string }>();
  const [mode, setMode] = useState<'choose' | 'form'>(manual === '1' ? 'form' : 'choose');

  const properties = useProperties();

  // Check this term's property slots first, for both ways of adding.
  const limit = account.data?.plan?.benefits.limits.max_properties;
  const used = account.data?.usage.property_slots_used ?? 0;
  if (limit !== undefined && used >= limit) {
    const usedBy = [
      ...(properties.data ?? []).map((p) => p.name),
      ...(account.data?.usage.deleted_still_counted ?? []).map((d) => `${d.name} (deleted)`),
    ];
    return (
      <PropertyLimitReached
        limit={limit}
        planName={account.data?.plan?.name ?? 'current'}
        usedBy={usedBy}
        renewsOn={account.data?.current ? formatDate(account.data.current.ends_at) : null}
      />
    );
  }
  // Pittu is offered only where it will work right now; everyone else sees the form.
  if (mode === 'choose' && me.data?.features.document_reading) {
    return <AddPropertyChoice onManual={() => setMode('form')} />;
  }
  return <AddPropertyForm />;
}

function AddPropertyForm() {
  const [values, setValues] = useState<PropertyFormValues>(emptyPropertyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ImagePickerAsset[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const scrollRef = useRef<ScrollView>(null);
  const createProperty = useCreateProperty();
  const invalidateProperty = useInvalidateProperty();
  const busy = phase.kind !== 'idle';

  const onChange = (patch: Partial<PropertyFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    const cleared = Object.keys(patch).filter((k) => errors[k]);
    if (cleared.length > 0) {
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !cleared.includes(k))));
    }
  };

  const addPhotos = async () => {
    const remaining = MAX_PHOTOS_AT_CREATION - photos.length;
    if (remaining <= 0) return;
    const picked = await pickPhotos(remaining);
    if (picked.length > 0) setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS_AT_CREATION));
  };

  const save = async () => {
    if (busy) return;
    const validation = validatePropertyForm(values);
    if (!validation.data) {
      setErrors(validation.errors);
      setFormError('Please check the highlighted fields.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setErrors({});
    setFormError(null);
    setPhase({ kind: 'saving' });

    let propertyId: string;
    try {
      propertyId = (await createProperty.mutateAsync(validation.data)).id;
    } catch (err) {
      setPhase({ kind: 'idle' });
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, "Couldn't save the property. Please try again."));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    let failed = 0;
    for (const [index, asset] of photos.entries()) {
      const total = photos.length;
      setPhase({ kind: 'uploading', index, total, progress: 0 });
      try {
        const file = await preparePhoto(asset);
        await uploadPhoto(propertyId, file, (progress) =>
          setPhase({ kind: 'uploading', index, total, progress }),
        );
      } catch {
        failed += 1;
      }
    }
    if (photos.length > 0) invalidateProperty(propertyId);

    // Straight to the property, which asks for what's still missing (the pin first).
    router.replace({
      pathname: '/properties/[id]',
      params: { id: propertyId, welcome: '1', failed: String(failed) },
    });
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          // Back to the standard header (the start screen colours it).
          title: 'Add property',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerBackVisible: !busy,
          gestureEnabled: !busy,
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {formError ? <Banner message={formError} /> : null}

        <PropertyForm values={values} errors={errors} onChange={onChange} />

        {/* Step 4 — Photos */}
        <FormSection
          title="Photos"
          subtitle={`Optional · up to ${MAX_PHOTOS_AT_CREATION} now, more later`}
        >
          <View style={styles.photoGrid}>
            {photos.map((p, i) => (
              <View key={p.uri} style={styles.photo}>
                <Image source={{ uri: p.uri }} style={styles.photoImage} contentFit="cover" />
                {!busy ? (
                  <Pressable
                    onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    style={styles.removePhoto}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}
                  >
                    <Icon name="close" size={13} color={colors.onPrimary} strokeWidth={3} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {photos.length < MAX_PHOTOS_AT_CREATION && !busy ? (
              <Pressable
                onPress={addPhotos}
                style={[styles.photo, styles.addPhoto]}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                <Icon name="camera" size={22} color={accents.sky.fg} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </FormSection>
      </ScrollView>

      {/* Step 5 — Save */}
      <Footer>
        {phase.kind === 'uploading' ? (
          <View style={styles.progress}>
            <Text style={typography.small}>
              Uploading photo {phase.index + 1} of {phase.total}…
            </Text>
            <ProgressBar progress={(phase.index + phase.progress) / phase.total} />
          </View>
        ) : null}
        <Button title="Save property" onPress={save} loading={busy} />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: accents.sky.fg,
    backgroundColor: accents.sky.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { fontSize: font(13), fontWeight: '700', color: accents.sky.fg },
  progress: { gap: space.xs },
});
