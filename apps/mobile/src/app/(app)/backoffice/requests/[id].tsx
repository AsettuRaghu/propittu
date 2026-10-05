import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  formatPrice,
  SERVICE_REQUEST_ACTION_LABELS,
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_TRANSITIONS,
  staffCan,
  VISIT_CONDITION_LABELS,
  VISIT_CONDITIONS,
  type BackofficeRequestDetail,
  type ServiceRequestStatus,
  type VisitCondition,
  type VisitMedia,
} from '@propittu/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  boKeys,
  useBoDeleteMedia,
  useBoRequest,
  useBoSaveReport,
  useBoUpdateRequest,
} from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { playVideo, preparePhoto, prepareVideo, uploadVisitMedia } from '@/api/uploads';
import { DateField, fromIsoDate, toIsoDate } from '@/components/DateField';
import { TextField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chips,
  KeyValue,
  ProgressBar,
  SectionTitle,
} from '@/components/ui';
import { VisitReportView } from '@/components/VisitReportView';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { pickPhotos, pickVideo } from '@/lib/pickPhotos';
import { colors, space, typography } from '@/theme';

/** Backoffice: one service request — lifecycle, schedule, visit report (M4/M9). */
export default function BackofficeRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch, isRefetching } = useBoRequest(id);
  const me = useMe();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const canManage = staffCan(me.data?.staff_role, 'requests.manage');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.primary}
        />
      }
    >
      <Summary request={data} />
      {canManage ? <Actions request={data} /> : null}
      {canManage && ['confirmed', 'scheduled', 'in_progress'].includes(data.status) ? (
        <ReportEditor key={data.report?.updated_at ?? 'new'} request={data} />
      ) : data.report ? (
        <View style={styles.section}>
          <Banner
            tone="info"
            message={
              data.status === 'completed'
                ? 'Published to the customer when the request was completed. The report is now locked.'
                : 'Draft report — not visible to the customer.'
            }
          />
          <VisitReportView report={data.report} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Summary({ request }: { request: BackofficeRequestDetail }) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <KeyValue label="Request ID" value={request.reference} />
        <Badge
          label={SERVICE_REQUEST_STATUS_LABELS[request.status]}
          tone={STATUS_TONES[request.status]}
        />
      </View>
      <KeyValue label="Service" value={request.service.name} />
      <KeyValue
        label="Cost"
        value={
          request.coverage === 'included'
            ? 'Included in plan (usage counted on confirm)'
            : request.price_paise !== null
              ? `Extra · ${formatPrice(request.price_paise)}`
              : 'Extra · price to be quoted'
        }
      />
      <View style={styles.links}>
        <Button
          title={request.customer_phone ? formatIndianMobile(request.customer_phone) : 'Customer'}
          variant="secondary"
          icon="person-outline"
          onPress={() => router.push(`/backoffice/accounts/${request.account_id}`)}
        />
        {request.property ? (
          <Button
            title={request.property.name}
            variant="secondary"
            icon="home-outline"
            onPress={() => router.push(`/backoffice/properties/${request.property?.id}`)}
          />
        ) : null}
      </View>
      <KeyValue label="Address" value={request.property_address} />
      <KeyValue label="Customer's request" value={request.description} />
      <KeyValue
        label="Preferred date"
        value={request.preferred_date ? formatDate(request.preferred_date) : null}
      />
      <KeyValue
        label="Scheduled for"
        value={request.scheduled_for ? formatDate(request.scheduled_for) : null}
      />
      <KeyValue label="Note to customer" value={request.status_note} />
      <KeyValue label="Opened" value={formatDate(request.created_at)} />
      <KeyValue
        label="Payment"
        value={
          request.order
            ? `${request.order.status === 'paid' ? 'Paid' : 'Awaiting payment'} · ${formatPrice(request.order.amount_paise)} · ${request.order.reference}`
            : request.coverage === 'extra' && request.price_paise !== null
              ? 'Not paid yet'
              : null
        }
      />
    </Card>
  );
}

function Actions({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const [note, setNote] = useState('');
  const [date, setDate] = useState<Date | null>(
    request.scheduled_for ? new Date(request.scheduled_for) : null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const next = SERVICE_REQUEST_TRANSITIONS[request.status];
  if (next.length === 0) return null;

  const run = (status: ServiceRequestStatus) => {
    setProblem(null);
    if (status === 'scheduled' && !date) {
      setProblem('Choose the visit date first.');
      return;
    }
    const scheduledFor =
      status === 'scheduled' && date
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10).toISOString()
        : null;
    const go = () =>
      update.mutate(
        { status, scheduled_for: scheduledFor, note: note.trim() || null },
        {
          onSuccess: () => setNote(''),
          onError: (err) => setProblem(errorMessage(err)),
        },
      );
    if (status === 'completed') {
      Alert.alert(
        'Complete this request?',
        request.report
          ? 'The visit report will be published to the customer and locked — check it before completing.'
          : 'There is no visit report. Complete anyway?',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Complete', onPress: go },
        ],
      );
    } else if (status === 'cancelled') {
      Alert.alert(
        'Cancel this request?',
        request.coverage === 'included' && request.status !== 'requested'
          ? 'The included visit will be returned to the customer’s allowance.'
          : undefined,
        [
          { text: 'Keep', style: 'cancel' },
          { text: 'Cancel request', style: 'destructive', onPress: go },
        ],
      );
    } else go();
  };

  return (
    <View style={styles.section}>
      <SectionTitle title="Update status" />
      <Card style={styles.card}>
        {problem ? <Banner message={problem} /> : null}
        {next.includes('scheduled') ? (
          <DateField label="Visit date" value={date} onChange={setDate} minimumDate={new Date()} />
        ) : null}
        <TextField
          label="Note to customer"
          optional
          placeholder="e.g. Our team will visit between 10 am and 1 pm"
          value={note}
          onChangeText={setNote}
          maxLength={1000}
          multiline
        />
        {next.map((status) => (
          <Button
            key={status}
            title={
              status === 'scheduled' && request.status === 'scheduled'
                ? 'Reschedule'
                : SERVICE_REQUEST_ACTION_LABELS[status]
            }
            variant={
              status === 'cancelled' ? 'danger' : status === next[0] ? 'primary' : 'secondary'
            }
            onPress={() => run(status)}
            loading={update.isPending && update.variables?.status === status}
            disabled={update.isPending}
          />
        ))}
      </Card>
    </View>
  );
}

function ReportEditor({ request }: { request: BackofficeRequestDetail }) {
  const save = useBoSaveReport(request.id);
  const deleteMedia = useBoDeleteMedia(request.id);
  const qc = useQueryClient();
  const report = request.report;

  const [visitedAt, setVisitedAt] = useState<Date | null>(
    report ? fromIsoDate(report.visited_at) : new Date(),
  );
  const [condition, setCondition] = useState<VisitCondition | null>(report?.condition ?? null);
  const [observations, setObservations] = useState(report?.observations ?? '');
  const [issues, setIssues] = useState(report?.issues ?? '');
  const [recommendations, setRecommendations] = useState(report?.recommendations ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const submit = () => {
    setProblem(null);
    if (!visitedAt || !condition) {
      setErrors({
        ...(visitedAt ? {} : { visited_at: 'Choose the visit date' }),
        ...(condition ? {} : { condition: 'Choose the property condition' }),
      });
      return;
    }
    setErrors({});
    save.mutate(
      { visited_at: toIsoDate(visitedAt), condition, observations, issues, recommendations },
      {
        onSuccess: () => Alert.alert('Report saved', 'The customer can now see it.'),
        onError: (err) => {
          setErrors(fieldErrors(err));
          setProblem(errorMessage(err));
        },
      },
    );
  };

  const refresh = () => void qc.invalidateQueries({ queryKey: boKeys.request(request.id) });

  const addPhotos = async () => {
    const assets = await pickPhotos(10);
    if (assets.length === 0) return;
    setProblem(null);
    try {
      for (const [i, asset] of assets.entries()) {
        setProgress(i / assets.length);
        const file = await preparePhoto(asset);
        await uploadVisitMedia(request.id, 'photo', file, (f) =>
          setProgress((i + f) / assets.length),
        );
      }
    } catch (err) {
      setProblem(errorMessage(err, "A photo couldn't be uploaded."));
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const addVideo = async () => {
    const asset = await pickVideo();
    if (!asset) return;
    setProblem(null);
    try {
      const file = prepareVideo(asset);
      setProgress(0);
      await uploadVisitMedia(request.id, 'video', file, setProgress);
    } catch (err) {
      setProblem(errorMessage(err, "The video couldn't be uploaded."));
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const mediaActions = (m: VisitMedia) =>
    Alert.alert(m.kind === 'video' ? 'Video' : 'Photo', undefined, [
      {
        text: 'Open',
        onPress: () => {
          if (!m.url) return;
          void (m.kind === 'video'
            ? playVideo({ url: m.url })
            : WebBrowser.openBrowserAsync(m.url).then(() => undefined));
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteMedia.mutate(m.id, {
            onError: (err) => Alert.alert("Couldn't delete", errorMessage(err)),
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={styles.section}>
      <SectionTitle title={report ? 'Visit report (draft)' : 'Write the visit report'} />
      <Text style={typography.caption}>
        Only staff can see the report until you mark the request Completed. Then it is published to
        the customer and locked. Every save keeps the previous version.
      </Text>
      <Card style={styles.card}>
        {problem ? <Banner message={problem} /> : null}
        <DateField
          label="Visit date"
          value={visitedAt}
          onChange={setVisitedAt}
          maximumDate={new Date()}
        />
        {errors.visited_at ? <Text style={styles.error}>{errors.visited_at}</Text> : null}
        <Text style={typography.overline}>Condition</Text>
        <Chips
          options={VISIT_CONDITIONS.map((c) => ({ value: c, label: VISIT_CONDITION_LABELS[c] }))}
          value={condition}
          onChange={setCondition}
        />
        {errors.condition ? <Text style={styles.error}>{errors.condition}</Text> : null}
        <TextField
          label="Observations"
          multiline
          maxLength={4000}
          value={observations}
          onChangeText={setObservations}
          placeholder="What did you see at the property?"
        />
        <TextField
          label="Issues found"
          optional
          multiline
          maxLength={4000}
          value={issues}
          onChangeText={setIssues}
          placeholder="Cracks, leaks, encroachment, overgrowth…"
        />
        <TextField
          label="Recommendations"
          optional
          multiline
          maxLength={4000}
          value={recommendations}
          onChangeText={setRecommendations}
        />
        <Button
          title={report ? 'Update report' : 'Save report'}
          onPress={submit}
          loading={save.isPending}
        />
      </Card>

      {report ? (
        <>
          <SectionTitle title="Photos and videos" />
          {progress !== null ? (
            <Card style={styles.card}>
              <Text style={typography.small}>Uploading {Math.round(progress * 100)}%</Text>
              <ProgressBar progress={progress} />
            </Card>
          ) : (
            <View style={styles.links}>
              <Button
                title="Add photos"
                variant="secondary"
                icon="images-outline"
                onPress={addPhotos}
              />
              <Button
                title="Add video"
                variant="secondary"
                icon="videocam-outline"
                onPress={addVideo}
              />
            </View>
          )}
          <Text style={typography.caption}>Customer preview:</Text>
          <VisitReportView report={report} onMediaPress={mediaActions} />
        </>
      ) : (
        <Text style={typography.caption}>Save the report first, then add photos and videos.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  card: { gap: space.lg },
  section: { gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  error: { fontSize: 13, color: colors.danger },
});
