import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MAX_PHOTOS_AT_CREATION } from '@propittu/shared';
import { useCreateProperty, useInvalidateProperty, useMe } from '@/api/queries';
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
import { accents, colors, gradients, radius, shadow, space, typography } from '@/theme';

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
  const { manual } = useLocalSearchParams<{ manual?: string }>();
  // Pittu is offered only where it is switched on; everyone else sees the form.
  const [mode, setMode] = useState<'choose' | 'form'>(manual === '1' ? 'form' : 'choose');
  if (mode === 'choose' && me.data?.features.document_reading) {
    return <ChooseHowToAdd onManual={() => setMode('form')} />;
  }
  return <AddPropertyForm />;
}

/** "Upload your Sale Deed" (recommended) or "Enter details myself". */
function ChooseHowToAdd({ onManual }: { onManual: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={typography.small}>How would you like to add your property?</Text>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.deedCard}
      >
        <Text style={styles.badge}>RECOMMENDED</Text>
        <Text style={styles.deedTitle}>Upload your Sale Deed</Text>
        <Text style={styles.deedText}>
          Pittu reads it and sets up your property for you — no long forms.
        </Text>
        {['Details filled in for you', 'We spot what needs attention', 'About a minute'].map(
          (t) => (
            <View key={t} style={styles.perk}>
              <Icon name="check" size={15} color="#FFFFFF" strokeWidth={3} />
              <Text style={styles.perkText}>{t}</Text>
            </View>
          ),
        )}
        <Button
          title="Upload sale deed"
          icon="upload"
          variant="secondary"
          onPress={() => router.push('/properties/deed')}
        />
      </LinearGradient>
      <Pressable
        onPress={onManual}
        accessibilityRole="button"
        style={({ pressed }) => [styles.manual, shadow, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.manualIcon}>
          <Icon name="edit" size={18} color={colors.textMuted} />
        </View>
        <View style={styles.flex}>
          <Text style={typography.bodyStrong}>Enter details myself</Text>
          <Text style={typography.caption}>You can upload the deed later</Text>
        </View>
        <Icon name="chevron" size={16} color={colors.textSubtle} />
      </Pressable>
    </ScrollView>
  );
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
        <FormSection
          icon="camera"
          accent="sky"
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
  deedCard: { borderRadius: radius.xl, padding: space.xl, gap: space.md },
  badge: {
    alignSelf: 'flex-start',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  deedTitle: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  deedText: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.92)' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  perkText: { fontSize: 13, color: '#FFFFFF' },
  manual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
  },
  manualIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
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
  addPhotoText: { fontSize: 13, fontWeight: '700', color: accents.sky.fg },
  progress: { gap: space.xs },
});
