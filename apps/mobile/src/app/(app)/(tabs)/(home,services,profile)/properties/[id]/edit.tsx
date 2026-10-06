import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { PropertyDetail } from '@propittu/shared';
import { useDeleteProperty, useProperty, useUpdateProperty, useMe } from '@/api/queries';
import { dialog, toast } from '@/components/Dialog';
import { DocumentSlots } from '@/components/DocumentSlots';
import { Footer } from '@/components/Footer';
import {
  FormSection,
  PropertyForm,
  propertyToForm,
  validatePropertyForm,
  type PropertyFormValues,
} from '@/components/PropertyForm';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDate } from '@/lib/format';
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
  const me = useMe();

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
    // The full object is sent, so clearing an optional field really clears it —
    // except the map pin, which only the location screen sets (this form has
    // no pin, so sending it would erase a location confirmed meanwhile).
    const { latitude: _lat, longitude: _lng, ...fields } = validation.data;
    update.mutate(fields, {
      onSuccess: () => {
        toast('Changes saved');
        router.back();
      },
      onError: (err) => {
        setErrors(fieldErrors(err));
        setFormError(errorMessage(err, "Couldn't save your changes. Please try again."));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      },
    });
  };

  const confirmDelete = async () => {
    const files = property.photos.length + property.document_count;
    const ok = await dialog.confirm({
      title: `Delete "${property.name}"?`,
      message: [
        files > 0 ? 'Its photos and documents will be permanently deleted.' : null,
        property.service_request_count > 0 ? 'Your service request history will be kept.' : null,
        me.data?.plan.ends_at
          ? `It still counts as one of your plan’s properties until ${formatDate(me.data.plan.ends_at)}, when your plan renews.`
          : null,
        'This cannot be undone.',
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Delete property',
      tone: 'danger',
      icon: 'delete',
    });
    if (!ok) return;
    remove.mutate(property.id, {
      onSuccess: () => {
        toast('Property deleted');
        router.dismissTo('/');
      },
      onError: (err) =>
        void dialog.alert({
          title: "Couldn't delete the property",
          message: errorMessage(err),
          tone: 'danger',
        }),
    });
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

        <FormSection
          icon="document"
          accent="amber"
          title="Documents"
          subtitle="Upload a document straight into its type."
        >
          <DocumentSlots propertyId={property.id} />
        </FormSection>

        <Button
          title="Delete property"
          variant="danger"
          icon="delete"
          onPress={() => void confirmDelete()}
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
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
});
