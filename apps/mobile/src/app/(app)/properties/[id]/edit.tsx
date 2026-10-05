import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import type { PropertyDetail } from '@propittu/shared';
import { useDeleteProperty, useProperty, useUpdateProperty } from '@/api/queries';
import { Footer } from '@/components/Footer';
import {
  PropertyForm,
  propertyToForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, Divider } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { space } from '@/theme';

/** Edit and delete a property (PRODUCT_SPEC.md §8.2). */
export default function EditPropertyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useProperty(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  // Keyed so the form re-initialises if the property id changes.
  return <EditForm key={data.id} property={data} />;
}

function EditForm({ property }: { property: PropertyDetail }) {
  const [values, setValues] = useState<PropertyFormValues>(() => propertyToForm(property));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const update = useUpdateProperty(property.id);
  const remove = useDeleteProperty();

  const onChange = (patch: Partial<PropertyFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const save = () => {
    const validation = validatePropertyForm(values);
    if (!validation.data) {
      setErrors(validation.errors);
      setFormError('Please check the highlighted fields.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setFormError(null);
    // The full object is sent, so clearing an optional field really clears it.
    update.mutate(validation.data, {
      onSuccess: () => router.back(),
      onError: (err) => {
        setErrors(fieldErrors(err));
        setFormError(errorMessage(err, "Couldn't save your changes. Please try again."));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      },
    });
  };

  const confirmDelete = () => {
    const files = property.photos.length + property.document_count;
    Alert.alert(
      `Delete "${property.name}"?`,
      [
        files > 0 ? 'Its photos and documents will be permanently deleted.' : null,
        property.service_request_count > 0
          ? 'Your service request history will be kept.'
          : null,
        'This cannot be undone.',
      ]
        .filter(Boolean)
        .join(' '),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(property.id, {
              onSuccess: () => router.dismissTo('/'),
              onError: (err) =>
                Alert.alert("Couldn't delete the property", errorMessage(err)),
            }),
        },
      ],
    );
  };

  const busy = update.isPending || remove.isPending;

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {formError ? <Banner message={formError} /> : null}
        <PropertyForm values={values} errors={errors} onChange={onChange} />
        <Divider />
        <Button
          title="Delete property"
          variant="danger"
          icon="trash-outline"
          onPress={confirmDelete}
          loading={remove.isPending}
          disabled={busy}
        />
      </ScrollView>
      <Footer>
        <Button title="Save changes" onPress={save} loading={update.isPending} disabled={busy} />
      </Footer>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
});
