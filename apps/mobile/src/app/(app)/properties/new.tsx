import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_PHOTOS_AT_CREATION } from '@propittu/shared';
import { useCreateProperty, useInvalidateProperty } from '@/api/queries';
import { preparePhoto, uploadPhoto } from '@/api/uploads';
import { Footer } from '@/components/Footer';
import {
  PropertyForm,
  emptyPropertyForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { Banner, Button, ProgressBar, SectionTitle } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { pickPhotos } from '@/lib/pickPhotos';
import { colors, radius, space, typography } from '@/theme';

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

    router.replace({
      pathname: '/properties/added',
      params: { id: propertyId, failed: String(failed) },
    });
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerBackVisible: !busy, gestureEnabled: !busy }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {formError ? <Banner message={formError} /> : null}

        <PropertyForm values={values} errors={errors} onChange={onChange} />

        {/* Step 4 — Photos */}
        <View style={styles.section}>
          <SectionTitle title="Photos" />
          <Text style={typography.small}>
            Optional. Add up to {MAX_PHOTOS_AT_CREATION} now — you can add more later.
          </Text>
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
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
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
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
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
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.md },
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
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  progress: { gap: space.xs },
});
