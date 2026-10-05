import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  formatPrice,
  SERVICE_REQUEST_STATUS_LABELS,
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
import { Badge, Banner, Button, Card, Chips, KeyValue, ProgressBar } from '@/components/ui';
import { VisitReportView } from '@/components/VisitReportView';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { STATUS_TONES } from '@/lib/icons';
import { pickPhotos, pickVideo } from '@/lib/pickPhotos';
import { colors, radius, space, typography } from '@/theme';

/**
 * Backoffice: one service request (M4/M9), as a guided flow — one next step
 * at a time:
 *
 *   1 Confirm  →  2 Schedule  →  3 Start visit  →  4 Report + Complete
 *
 * The report is written only after the visit has started, and completing
 * publishes it to the customer and locks it.
 */
export default function BackofficeRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch, isRefetching } = useBoRequest(id);
  const me = useMe();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const canManage = staffCan(me.data?.staff_role, 'requests.manage');
  const open = !['completed', 'cancelled'].includes(data.status);

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
      <Steps status={data.status} />

      {canManage && data.status === 'in_progress' ? (
        <>
          <ReportEditor key={data.report?.updated_at ?? 'new'} request={data} />
          <CompleteStep request={data} />
        </>
      ) : canManage && open ? (
        <NextStep key={data.status} request={data} />
      ) : null}

      {data.status === 'completed' ? (
        <Banner
          tone="success"
          message={
            data.report
              ? 'Completed. The visit report has been published to the customer and is locked.'
              : 'Completed.'
          }
        />
      ) : null}
      {data.status === 'cancelled' ? (
        <Banner tone="neutral" message="This request was cancelled." />
      ) : null}
      {data.status !== 'in_progress' && data.report ? (
        <VisitReportView report={data.report} />
      ) : null}

      {canManage && open ? <CancelRequest request={data} /> : null}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */

function Summary({ request }: { request: BackofficeRequestDetail }) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={typography.heading}>{request.service.name}</Text>
          <Text style={typography.caption}>{request.reference}</Text>
        </View>
        <Badge
          label={SERVICE_REQUEST_STATUS_LABELS[request.status]}
          tone={STATUS_TONES[request.status]}
        />
      </View>
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
        label="Cost"
        value={
          request.coverage === 'included'
            ? 'Included in the customer’s plan'
            : request.price_paise !== null
              ? `Extra · ${formatPrice(request.price_paise)}${
                  request.order?.status === 'paid' ? ' · Paid' : ' · not paid yet'
                }`
              : 'Extra · price to be quoted'
        }
      />
      <KeyValue
        label="Preferred date"
        value={request.preferred_date ? formatDate(request.preferred_date) : null}
      />
      <KeyValue
        label="Visit date"
        value={request.scheduled_for ? formatDate(request.scheduled_for) : null}
      />
      <KeyValue label="Last message to customer" value={request.status_note} />
    </Card>
  );
}

/* ---- Progress strip ---------------------------------------------- */

const FLOW: { status: ServiceRequestStatus; label: string }[] = [
  { status: 'requested', label: 'Requested' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'in_progress', label: 'Visit' },
  { status: 'completed', label: 'Done' },
];

function Steps({ status }: { status: ServiceRequestStatus }) {
  if (status === 'cancelled') return null;
  const current = FLOW.findIndex((s) => s.status === status);
  return (
    <View style={styles.steps}>
      {FLOW.map((s, i) => {
        const done = i < current || status === 'completed';
        const active = i === current && status !== 'completed';
        return (
          <View key={s.status} style={styles.step}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
            </View>
            <Text style={[styles.stepLabel, (done || active) && styles.stepLabelOn]}>
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ---- One next step at a time -------------------------------------- */

function NextStep({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const [note, setNote] = useState('');
  const [date, setDate] = useState<Date | null>(
    request.scheduled_for
      ? new Date(request.scheduled_for)
      : request.preferred_date
        ? fromIsoDate(request.preferred_date)
        : null,
  );
  const [rescheduling, setRescheduling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const move = (status: ServiceRequestStatus) => {
    setProblem(null);
    if (status === 'scheduled' && !date) {
      setProblem('Choose the visit date first.');
      return;
    }
    update.mutate(
      {
        status,
        scheduled_for:
          status === 'scheduled' && date
            ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10).toISOString()
            : null,
        note: note.trim() || null,
      },
      { onError: (err) => setProblem(errorMessage(err)) },
    );
  };

  const step =
    request.status === 'requested'
      ? {
          title: 'Step 1 of 4 · Confirm the request',
          help:
            request.coverage === 'included'
              ? 'Confirming uses one of the customer’s included visits.'
              : 'Confirm once you can take this request on.',
          action: 'Confirm request',
          target: 'confirmed' as const,
        }
      : request.status === 'confirmed' || rescheduling
        ? {
            title: rescheduling ? 'Change the visit date' : 'Step 2 of 4 · Schedule the visit',
            help: 'Pick the visit date. The customer sees it on their request.',
            action: rescheduling ? 'Save new date' : 'Schedule visit',
            target: 'scheduled' as const,
          }
        : {
            title: 'Step 3 of 4 · Start the visit',
            help: 'Tap this when the visit begins. You then write the report and add photos.',
            action: 'Start visit',
            target: 'in_progress' as const,
          };

  return (
    <Card style={[styles.card, styles.stepCard]}>
      <Text style={typography.heading}>{step.title}</Text>
      <Text style={typography.small}>{step.help}</Text>
      {problem ? <Banner message={problem} /> : null}
      {step.target === 'scheduled' ? (
        <DateField label="Visit date" value={date} onChange={setDate} minimumDate={new Date()} />
      ) : null}
      <TextField
        label="Message to customer"
        optional
        placeholder={
          step.target === 'scheduled'
            ? 'e.g. Our team will visit between 10 am and 1 pm'
            : 'e.g. We have received your request'
        }
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        multiline
      />
      <Button title={step.action} onPress={() => move(step.target)} loading={update.isPending} />
      {request.status === 'scheduled' ? (
        <Button
          title={rescheduling ? 'Keep the current date' : 'Change the visit date'}
          variant="ghost"
          onPress={() => setRescheduling((v) => !v)}
        />
      ) : null}
    </Card>
  );
}

function CompleteStep({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const [problem, setProblem] = useState<string | null>(null);
  const hasReport = !!request.report;

  const complete = () =>
    Alert.alert(
      hasReport ? 'Complete and publish the report?' : 'Complete without a report?',
      hasReport
        ? 'The customer will see the report and photos. After this the report can no longer be changed.'
        : 'The customer will not get a visit report.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () =>
            update.mutate(
              { status: 'completed', note: null },
              { onError: (err) => setProblem(errorMessage(err)) },
            ),
        },
      ],
    );

  return (
    <Card style={[styles.card, styles.stepCard]}>
      <Text style={typography.heading}>Finish · Complete the request</Text>
      <Text style={typography.small}>
        {hasReport
          ? 'When the report and photos are ready, complete the request to publish them to the customer.'
          : 'Save the visit report above first. The customer sees it once you complete.'}
      </Text>
      {problem ? <Banner message={problem} /> : null}
      <Button
        title={hasReport ? 'Complete & publish report' : 'Complete without a report'}
        variant={hasReport ? 'primary' : 'secondary'}
        onPress={complete}
        loading={update.isPending}
      />
    </Card>
  );
}

function CancelRequest({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const cancel = () =>
    Alert.alert(
      'Cancel this request?',
      request.coverage === 'included' && request.status !== 'requested'
        ? 'The included visit is returned to the customer’s allowance.'
        : undefined,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: () =>
            update.mutate(
              { status: 'cancelled', note: null },
              { onError: (err) => Alert.alert("Couldn't cancel", errorMessage(err)) },
            ),
        },
      ],
    );
  return (
    <Pressable onPress={cancel} style={styles.cancel} accessibilityRole="button">
      <Text style={styles.cancelText}>Cancel this request</Text>
    </Pressable>
  );
}

/* ---- Step 4: the visit report (draft until completed) ------------- */

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
        onSuccess: () =>
          Alert.alert(
            'Draft saved',
            'Only staff can see it for now. Add photos, then complete the request to publish it.',
          ),
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
    <Card style={[styles.card, styles.stepCard]}>
      <Text style={typography.heading}>Step 4 of 4 · Visit report</Text>
      <Text style={typography.small}>
        {report
          ? 'Draft saved — only staff can see it. You can keep editing until you complete the request.'
          : 'Fill this in during or after the visit and save it. The customer sees it only after you complete the request.'}
      </Text>
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
        title={report ? 'Save changes' : 'Save report'}
        onPress={submit}
        loading={save.isPending}
      />

      <Text style={typography.overline}>Photos and videos</Text>
      {!report ? (
        <Text style={typography.caption}>Save the report first, then add photos and videos.</Text>
      ) : progress !== null ? (
        <View style={styles.uploading}>
          <Text style={typography.small}>Uploading {Math.round(progress * 100)}%</Text>
          <ProgressBar progress={progress} />
        </View>
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
      {report && report.media.length > 0 ? (
        <>
          <Text style={typography.caption}>What the customer will see:</Text>
          <VisitReportView report={report} onMediaPress={mediaActions} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  card: { gap: space.md },
  stepCard: { borderColor: colors.primary, borderWidth: 1.5 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  flex: { flex: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  uploading: { gap: space.sm },
  error: { fontSize: 13, color: colors.danger },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs },
  step: { alignItems: 'center', gap: space.xs, flex: 1 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  stepLabel: { fontSize: 11, color: colors.textSubtle },
  stepLabelOn: { color: colors.text, fontWeight: '600' },
  cancel: { alignSelf: 'center', padding: space.md },
  cancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
