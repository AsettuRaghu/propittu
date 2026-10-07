import { useRef } from 'react';
import { openServicesTab } from '@/lib/nav';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  pittuQuestions,
  type CompletionItem,
  type CompletionKey,
  type PropertyDetail,
} from '@propittu/shared';
import { usePittu } from '@/api/ai';
import { useProperty, useServiceRequests } from '@/api/queries';
import { DocumentSlots } from '@/components/DocumentSlots';
import type { IconName } from '@/components/Icon';
import { PhotoSection, type PhotoSectionHandle } from '@/components/PhotoSection';
import { LocationIssueNotice } from '@/components/LocationIssueNotice';
import { PropertyCover } from '@/components/PropertyCover';
import { PropertyMapCard } from '@/components/PropertyMapCard';
import { PullRefresh } from '@/components/PullRefresh';
import { DataCredits } from '@/components/DataCredits';
import { ReachNotice } from '@/components/ReachNotice';
import { RequestRow } from '@/components/ServiceRequestList';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection } from '@/components/VideoSection';
import { Banner, IconButton, KeyValue, LinkButton, ListGroup, ListRow } from '@/components/ui';
import { formatArea } from '@/lib/format';
import { goToCompletionStep } from '@/lib/propertySteps';
import { radius, shadow, space } from '@/theme';

const STEP_ICONS: Record<CompletionKey, IconName> = {
  basics: 'home',
  address: 'pin',
  location: 'pin',
  sale_deed: 'deed',
  photo: 'camera',
  area: 'area',
  identifiers: 'tag',
  property_tax: 'receipt',
};

/**
 * The property page — everything about one property, flat like Profile:
 * its cover (photo, place, live weather), where it is (map with Directions
 * and Share, or a bold prompt to pin it), what's still missing, the
 * details, documents, photos, videos and services.
 */
export default function PropertyDetailsScreen() {
  const { id, welcome, failed } = useLocalSearchParams<{
    id: string;
    welcome?: string;
    failed?: string;
  }>();
  const { data: property, isPending, error, refetch } = useProperty(id);
  const photosRef = useRef<PhotoSectionHandle>(null);

  if (isPending) return <LoadingState />;
  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Property' }} />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </>
    );
  }

  const edit = () => router.push(`/properties/${property.id}/edit`);
  const onStep = (item: CompletionItem) =>
    item.key === 'photo' ? photosRef.current?.add() : goToCompletionStep(property.id, item.key);
  // The map prompt already asks for the pin, so it isn't repeated in the list.
  const missing = property.completion.next.filter((i) => i.key !== 'location');
  const failedPhotos = Number(failed) || 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Stack.Screen options={{ title: '' }} />

      <View style={[styles.cover, shadow]}>
        <PropertyCover
          property={property}
          height={250}
          size="lg"
          photos={property.photos.flatMap((ph) => (ph.url ? [ph.url] : []))}
          approximate={property.latitude !== null && property.location_source !== 'user'}
        >
          <IconButton icon="edit" label="Edit property" size={36} onPress={edit} />
        </PropertyCover>
      </View>

      {welcome === '1' ? (
        <Banner
          tone="success"
          icon="success"
          message={
            failedPhotos > 0
              ? `It’s in your locker. ${failedPhotos} photo${failedPhotos === 1 ? '' : 's'} couldn’t be uploaded — add them again below.`
              : property.latitude !== null
                ? 'It’s in your locker. We placed it near the area in your deed — set the exact spot below.'
                : 'It’s in your locker. Pin the exact location below — it takes a few seconds.'
          }
        />
      ) : null}

      <LocationIssueNotice property={property} />
      <PropertyMapCard property={property} />
      <ReachNotice propertyId={property.id} reach={property.reach} />

      {missing.length > 0 ? (
        <ListGroup title={`Complete your profile · ${property.completion.percent}%`} plain>
          {missing.map((item) => (
            <ListRow
              key={item.key}
              icon={STEP_ICONS[item.key]}
              accent="amber"
              title={item.label}
              onPress={() => onStep(item)}
            />
          ))}
          <PittuRow propertyId={property.id} />
        </ListGroup>
      ) : (
        <PittuSection propertyId={property.id} />
      )}

      <Details property={property} onEdit={edit} />

      <DocumentSlots
        propertyId={property.id}
        action={
          <LinkButton
            title="All documents"
            onPress={() => router.push(`/properties/${property.id}/documents`)}
          />
        }
      />

      <ListGroup title={`Photos · ${property.photos.length}`} plain>
        <View style={styles.inner}>
          <PhotoSection ref={photosRef} propertyId={property.id} photos={property.photos} />
        </View>
      </ListGroup>

      <ListGroup title="Videos" plain>
        <View style={styles.inner}>
          <VideoSection propertyId={property.id} videos={property.videos} />
        </View>
      </ListGroup>

      <Services property={property} />

      <DataCredits weather={property.latitude !== null} />
    </ScrollView>
  );
}

/**
 * Pittu's quick questions, reopened where they were left — or, once all
 * answered, the checklist and care plan they lead to.
 */
function PittuRow({ propertyId }: { propertyId: string }) {
  const { data } = usePittu(propertyId);
  if (!data) return null;
  const questions = pittuQuestions(data.context, data.answers);
  const answered = questions.filter((q) => data.answers[q.id]).length;
  const open = () =>
    router.push({
      pathname: '/properties/[id]/pittu',
      params: { id: propertyId, from: 'property' },
    });
  return answered < questions.length ? (
    <ListRow
      icon="sparkles"
      accent="violet"
      title="Pittu’s quick questions"
      subtitle={`${answered} of ${questions.length} answered · so we know what your property needs`}
      subtitleLines={2}
      onPress={open}
    />
  ) : (
    <ListRow
      icon="sparkles"
      accent="violet"
      title="Your documents checklist and care plan"
      subtitle="What to keep, and what Pittu suggests"
      onPress={open}
    />
  );
}

/** With the profile complete, Pittu's row gets its own heading (once there is something to show). */
function PittuSection({ propertyId }: { propertyId: string }) {
  const { data } = usePittu(propertyId);
  if (!data) return null;
  return (
    <ListGroup title="From Pittu" plain>
      <PittuRow propertyId={propertyId} />
    </ListGroup>
  );
}

/** What we know about the property; empty facts are simply left out. */
function Details({ property: p, onEdit }: { property: PropertyDetail; onEdit: () => void }) {
  const address = [p.address_line, p.city, p.state, p.pincode].filter(Boolean).join(', ');
  return (
    <ListGroup title="Details" plain action={<LinkButton title="Edit" onPress={onEdit} />}>
      <View style={[styles.inner, styles.facts]}>
        <KeyValue icon="pin" label="Address" value={address || 'Not added yet'} />
        <KeyValue icon="area" label="Area" value={formatArea(p.area_value, p.area_unit)} />
        <KeyValue icon="tag" label="Survey number" value={p.survey_number} />
        <KeyValue icon="deed" label="Khata / Property ID" value={p.khata_number} />
        <KeyValue icon="home" label="Plot / Property number" value={p.property_number} />
        <KeyValue icon="document" label="Notes" value={p.notes} />
      </View>
    </ListGroup>
  );
}

/** Recent requests for this property, and booking one — the rest is in the Services tab. */
function Services({ property }: { property: PropertyDetail }) {
  const { data } = useServiceRequests(property.id);
  const recent = (data ?? []).slice(0, 3);
  return (
    <ListGroup
      title="Services"
      plain
      action={
        recent.length > 0 ? (
          <LinkButton title="All requests" onPress={() => openServicesTab('requests')} />
        ) : undefined
      }
    >
      {recent.map((r) => (
        <RequestRow key={r.id} request={r} />
      ))}
      <ListRow
        icon="add"
        title="Book a service for this property"
        onPress={() =>
          router.push({ pathname: '/services/request', params: { propertyId: property.id } })
        }
      />
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xs, gap: space.xl, paddingBottom: space.xxl },
  cover: { borderRadius: radius.lg, overflow: 'hidden' },
  // Same 14 pt inset as list rows, so content lines up under each heading.
  inner: { paddingHorizontal: 14, paddingVertical: space.xs },
  facts: { gap: space.sm },
});
