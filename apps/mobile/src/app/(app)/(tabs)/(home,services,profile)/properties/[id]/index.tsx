import { useRef } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  FACING_LABELS,
  KHATA_TYPE_LABELS,
  LAND_USE_LABELS,
  LEGAL_LEVEL_LABELS,
  pittuQuestions,
  type CompletionItem,
  type CompletionKey,
  type LegalLevel,
  type PropertyDetail,
} from '@propittu/shared';
import { useLegalChecks, usePittu, usePropertyNews, usePropertyValue } from '@/api/ai';
import { useProperty, useServiceRequests, useServices } from '@/api/queries';
import { DocumentSlots } from '@/components/DocumentSlots';
import type { IconName } from '@/components/Icon';
import { PhotoSection, type PhotoSectionHandle } from '@/components/PhotoSection';
import { LocationIssueNotice } from '@/components/LocationIssueNotice';
import { PropertyCover } from '@/components/PropertyCover';
import { PropertyMapCard } from '@/components/PropertyMapCard';
import { PullRefresh } from '@/components/PullRefresh';
import { DataCredits } from '@/components/DataCredits';
import { DeedGaps } from '@/components/DeedGaps';
import { DeedReadRow } from '@/components/DeedReadRow';
import { ReachNotice } from '@/components/ReachNotice';
import { RequestRow } from '@/components/ServiceRequestList';
import { ErrorState, LoadingState } from '@/components/States';
import { VideoSection } from '@/components/VideoSection';
import {
  Badge,
  Banner,
  IconButton,
  KeyValue,
  LinkButton,
  ListGroup,
  ListRow,
} from '@/components/ui';
import { formatArea, formatDate, rupeesShort } from '@/lib/format';
import { hasNewNews, useNewsSeen } from '@/lib/newsSeen';
import { goToCompletionStep } from '@/lib/propertySteps';
import { radius, shadow, space, type Accent } from '@/theme';

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
  const openMedia = () => router.push(`/properties/${property.id}/media`);
  const onStep = (item: CompletionItem) =>
    item.key === 'photo' ? photosRef.current?.add() : goToCompletionStep(property.id, item.key);
  // The map prompt already asks for the pin, so it isn't repeated in the list.
  const missing = property.completion.next.filter((i) => i.key !== 'location');
  const failedPhotos = Number(failed) || 0;
  const showHealth = missing.length > 0 || property.health.score < 100;

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
      <DeedGaps property={property} />

      {showHealth ? (
        <ListGroup title={`Property health · ${property.health.score}`} plain>
          {missing.map((item) => (
            <ListRow
              key={item.key}
              icon={STEP_ICONS[item.key]}
              accent="amber"
              title={item.label}
              onPress={() => onStep(item)}
            />
          ))}
          <HealthActions property={property} />
          <DeedReadRow property={property} />
          <PittuRow propertyId={property.id} />
        </ListGroup>
      ) : null}
      <PittuSection property={property} withSetup={!showHealth} />

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

      <ListGroup
        title={`Photos · ${property.photos.length}`}
        plain
        action={<LinkButton title="Photos & videos" onPress={openMedia} />}
      >
        <View style={styles.inner}>
          <PhotoSection ref={photosRef} propertyId={property.id} photos={property.photos} />
        </View>
      </ListGroup>

      <ListGroup
        title={`Videos · ${property.videos.length}`}
        plain
        action={<LinkButton title="See all" onPress={openMedia} />}
      >
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

/** Health points still to earn that aren't profile steps: this year's tax, a visit. */
function HealthActions({ property: p }: { property: PropertyDetail }) {
  const services = useServices();
  const book = (code: string) => {
    const service = (services.data ?? []).find((s) => s.code === code);
    router.push({
      pathname: '/services/request',
      params: { propertyId: p.id, ...(service ? { serviceId: service.id } : {}) },
    });
  };
  const open = (key: string) => p.health.items.some((i) => i.key === key && !i.done);
  return (
    <>
      {open('tax') ? (
        <ListRow
          icon="receipt"
          accent="amber"
          title={p.health.items.find((i) => i.key === 'tax')!.label.replace('paid', 'to pay')}
          subtitle="Paid already? Tell Pittu. Not yet? We can pay it for you"
          subtitleLines={2}
          onPress={() => book('property_tax_assistance')}
        />
      ) : null}
      {open('visit') ? (
        <ListRow
          icon="camera"
          accent="amber"
          title="Not seen in person this year"
          subtitle="Book a visit — photos and a short report"
          onPress={() => book('property_visit')}
        />
      ) : null}
    </>
  );
}

const LEVEL_ACCENTS: Record<LegalLevel, Accent> = { green: 'teal', amber: 'amber', red: 'coral' };

/**
 * What Pittu has for this property, each checked by our team first: news
 * around it, its government value and the shared records check. With the
 * profile complete, the deed reading and quick questions move here too.
 */
function PittuSection({ property, withSetup }: { property: PropertyDetail; withSetup: boolean }) {
  const pittu = usePittu(property.id);
  const news = usePropertyNews(property.id).data ?? [];
  const value = usePropertyValue(property.id).data;
  const check = useLegalChecks(property.id).data?.[0];
  const seen = useNewsSeen();
  const unread = !!property.deed_reading && property.deed_reading.status !== 'ready';
  const setup = withSetup && (!!pittu.data || unread);
  const worth = value?.government_value_inr ?? null;
  if (!setup && !news.length && worth === null && !check) return null;
  const open = (page: 'news' | 'value' | 'legal') =>
    router.push(`/properties/${property.id}/${page}`);
  const newsAt = news.reduce<string | null>(
    (latest, n) => (n.reviewed_at && (!latest || n.reviewed_at > latest) ? n.reviewed_at : latest),
    null,
  );
  return (
    <ListGroup title="From Pittu" plain>
      {setup ? <DeedReadRow property={property} /> : null}
      {setup ? <PittuRow propertyId={property.id} /> : null}
      {news.length ? (
        <ListRow
          icon="map"
          accent="sky"
          title="Around your property"
          subtitle={news[0]!.title}
          subtitleLines={2}
          right={
            hasNewNews(seen, property.id, newsAt) ? <Badge label="New" tone="brand" /> : undefined
          }
          onPress={() => open('news')}
        />
      ) : null}
      {worth !== null ? (
        <ListRow
          icon="government"
          accent="indigo"
          title={`Government value · ${rupeesShort(worth)}`}
          subtitle="The government’s rate for your area — not a selling price"
          subtitleLines={2}
          onPress={() => open('value')}
        />
      ) : null}
      {check ? (
        <ListRow
          icon="verified"
          accent={check.overall ? LEVEL_ACCENTS[check.overall] : 'slate'}
          title={`Records check · ${check.overall ? LEGAL_LEVEL_LABELS[check.overall] : 'No findings'}`}
          subtitle={check.summary ?? 'What the EC shows, checked against your sale deed'}
          subtitleLines={2}
          onPress={() => open('legal')}
        />
      ) : null}
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
        <KeyValue
          icon="rupee"
          label="Bought"
          value={
            [
              p.purchase_price_inr ? `₹${p.purchase_price_inr.toLocaleString('en-IN')}` : null,
              p.purchase_date ? `on ${formatDate(p.purchase_date)}` : null,
              p.sellers ? `from ${p.sellers}` : null,
            ]
              .filter(Boolean)
              .join(' ') || null
          }
        />
        <KeyValue
          icon="land"
          label="Land use"
          value={p.land_use ? LAND_USE_LABELS[p.land_use] : null}
        />
        <KeyValue
          icon="verified"
          label="Khata type · approved by"
          value={
            [p.khata_type ? KHATA_TYPE_LABELS[p.khata_type] : null, p.approving_authority]
              .filter(Boolean)
              .join(' · ') || null
          }
        />
        <KeyValue icon="tag" label="RERA number" value={p.rera_number} />
        <KeyValue
          icon="compass"
          label="The site"
          value={
            [
              p.plot_dimensions,
              p.facing ? `${FACING_LABELS[p.facing]} facing` : null,
              p.corner_plot ? 'corner plot' : null,
              p.road_width_ft ? `${p.road_width_ft} ft road` : null,
            ]
              .filter(Boolean)
              .join(' · ') || null
          }
        />
        <KeyValue
          icon="map"
          label="Boundaries"
          value={
            [
              p.boundary_north ? `N: ${p.boundary_north}` : null,
              p.boundary_south ? `S: ${p.boundary_south}` : null,
              p.boundary_east ? `E: ${p.boundary_east}` : null,
              p.boundary_west ? `W: ${p.boundary_west}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null
          }
        />
        <KeyValue
          icon="wallet"
          label="Loan on the property"
          value={p.loan_on_property === null ? null : p.loan_on_property ? 'Yes' : 'No'}
        />
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
          <LinkButton
            title="All requests"
            onPress={() => router.push(`/properties/${property.id}/requests`)}
          />
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
