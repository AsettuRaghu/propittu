import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  formatIndianMobile,
  formatPrice,
  SERVICE_FULFILMENT_LABELS,
  requestStatusLabel,
  staffCan,
  VISIT_CONDITION_LABELS,
  VISIT_CONDITIONS,
  type BackofficeRequestDetail,
  type DocumentType,
  type OutcomeFile,
  type ServiceRequestStatus,
  type VisitCondition,
  type VisitMedia,
} from '@propittu/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  boKeys,
  useBoAskCustomer,
  useBoDeleteMedia,
  useBoDeleteOutcomeFile,
  useBoRequest,
  useBoSaveOutcome,
  useBoSaveReport,
  useBoSetFulfilment,
  useBoUpdateRequest,
} from '@/api/backoffice';
import { PullRefresh } from '@/components/PullRefresh';
import { useMe } from '@/api/queries';
import {
  playVideo,
  prepareDocument,
  preparePhoto,
  prepareVideo,
  uploadOutcomeFile,
  uploadVisitMedia,
} from '@/api/uploads';
import { dialog } from '@/components/Dialog';
import { OutcomeView } from '@/components/OutcomeView';
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
import { showAlert } from '@/lib/alert';
import { Icon } from '@/components/Icon';

/**
 * Backoffice: one service request (M4/M9), as a guided flow — one next step
 * at a time, by the kind of work:
 *
 *   On-site visit   1 Confirm → 2 Schedule → 3 Start visit → 4 Report + Complete
 *   Paperwork help  1 Accept → 2 Work on it (ask the customer if needed)
 *                   → 3 Outcome + files + Complete
 *
 * Completing publishes the report / outcome to the customer and locks it;
 * an outcome's result files are saved into the property's Documents.
 */
export default function BackofficeRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error, refetch } = useBoRequest(id);
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
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Summary request={data} canManage={canManage} />
      <Steps request={data} />

      {canManage && open && data.fulfilment === 'assistance' && data.status !== 'requested' ? (
        <>
          {data.status === 'confirmed' ? <StartWorking request={data} /> : null}
          <AskCustomer key={`ask-${data.status}`} request={data} />
          <OutcomeEditor key={data.outcome?.updated_at ?? 'new'} request={data} />
          <CompleteStep request={data} />
        </>
      ) : canManage && data.status === 'in_progress' ? (
        <>
          <ReportEditor key={data.report?.updated_at ?? 'new'} request={data} />
          <CompleteStep request={data} />
        </>
      ) : canManage && open ? (
        <NextStep key={data.status} request={data} />
      ) : null}

      {data.info_ticket ? (
        <Button
          title={`Conversation with the customer · ${data.info_ticket.reference}`}
          variant="ghost"
          icon="chat"
          onPress={() => router.push(`/backoffice/tickets/${data.info_ticket?.id}`)}
        />
      ) : null}

      {data.status === 'completed' ? (
        <Banner
          tone="success"
          message={
            data.report
              ? 'Completed. The visit report has been published to the customer and is locked.'
              : data.outcome
                ? 'Completed. The outcome has been published to the customer and its files saved to the property’s Documents.'
                : 'Completed.'
          }
        />
      ) : null}
      {!open && data.outcome ? <OutcomeView outcome={data.outcome} /> : null}
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

function Summary({ request, canManage }: { request: BackofficeRequestDetail; canManage: boolean }) {
  const setType = useBoSetFulfilment(request.id);
  const other = request.fulfilment === 'visit' ? 'assistance' : 'visit';
  const switchable =
    canManage &&
    ['requested', 'confirmed'].includes(request.status) &&
    !request.report &&
    !request.outcome;
  const switchType = async () => {
    const ok = await dialog.confirm({
      title: `Handle as ${SERVICE_FULFILMENT_LABELS[other].toLowerCase()}?`,
      message:
        other === 'assistance'
          ? 'No visit or schedule: accept, work on it, ask the customer if needed, and finish with an outcome and files.'
          : 'Schedule a visit and finish with a visit report and photos.',
      confirmLabel: 'Change type',
    });
    if (ok)
      setType.mutate(other, { onError: (err) => showAlert("Couldn't change", errorMessage(err)) });
  };
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={typography.heading}>{request.service.name}</Text>
          <Text style={typography.caption}>{request.reference}</Text>
        </View>
        <Badge
          label={requestStatusLabel(request.status, request.fulfilment)}
          tone={STATUS_TONES[request.status]}
        />
      </View>
      <View style={styles.links}>
        <Button
          title={request.customer_phone ? formatIndianMobile(request.customer_phone) : 'Customer'}
          variant="secondary"
          icon="user"
          onPress={() => router.push(`/backoffice/accounts/${request.account_id}`)}
        />
        {request.property ? (
          <Button
            title={request.property.name}
            variant="secondary"
            icon="home"
            onPress={() => router.push(`/backoffice/properties/${request.property?.id}`)}
          />
        ) : null}
      </View>
      <View style={styles.typeRow}>
        <View style={styles.flex}>
          <KeyValue label="Type" value={SERVICE_FULFILMENT_LABELS[request.fulfilment]} />
        </View>
        {switchable ? (
          <Button
            title={`Make it ${SERVICE_FULFILMENT_LABELS[other].toLowerCase()}`}
            variant="ghost"
            size="sm"
            onPress={() => void switchType()}
            loading={setType.isPending}
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
      {request.fulfilment === 'visit' ? (
        <>
          <KeyValue
            label="Preferred date"
            value={request.preferred_date ? formatDate(request.preferred_date) : null}
          />
          <KeyValue
            label="Visit date"
            value={request.scheduled_for ? formatDate(request.scheduled_for) : null}
          />
        </>
      ) : null}
      <KeyValue label="Last message to customer" value={request.status_note} />
    </Card>
  );
}

/* ---- Progress strip ---------------------------------------------- */

/**
 * The same four steps as the "Step N of 4" cards. The step you are on is
 * the one whose action you still have to take:
 *   Requested → step 1 (Confirm) … In Progress → step 4 (Report & complete).
 */
const FLOWS: Record<
  BackofficeRequestDetail['fulfilment'],
  { label: string; current: ServiceRequestStatus[] }[]
> = {
  visit: [
    { label: 'Confirm', current: ['requested'] },
    { label: 'Schedule', current: ['confirmed'] },
    { label: 'Visit', current: ['scheduled'] },
    { label: 'Report', current: ['in_progress'] },
  ],
  assistance: [
    { label: 'Accept', current: ['requested'] },
    { label: 'Work on it', current: ['confirmed'] },
    { label: 'Outcome', current: ['in_progress', 'awaiting_customer'] },
  ],
};

function Steps({ request }: { request: BackofficeRequestDetail }) {
  const status = request.status;
  if (status === 'cancelled') return null;
  const FLOW = FLOWS[request.fulfilment];
  const current =
    status === 'completed' ? FLOW.length : FLOW.findIndex((s) => s.current.includes(status));
  return (
    <View style={styles.steps}>
      {FLOW.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={s.label} style={styles.step}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? (
                <Icon name="check" size={14} color={colors.onPrimary} />
              ) : (
                <Text style={[styles.dotNumber, active && styles.dotNumberActive]}>{i + 1}</Text>
              )}
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

  const move = (status: Exclude<ServiceRequestStatus, 'awaiting_customer'>) => {
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
      ? request.fulfilment === 'assistance'
        ? {
            title: 'Step 1 of 3 · Accept the request',
            help:
              request.coverage === 'included'
                ? 'Accepting uses one of the customer’s included services. No visit or schedule is needed.'
                : 'Accept once you can take this on. No visit or schedule is needed.',
            action: 'Accept request',
            target: 'confirmed' as const,
          }
        : {
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
  if (request.fulfilment === 'assistance') return <CompleteOutcome request={request} />;
  return <CompleteVisit request={request} />;
}

function CompleteOutcome({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const [problem, setProblem] = useState<string | null>(null);
  const outcome = request.outcome;
  const toDocs = outcome?.files.filter((f) => f.document_type).length ?? 0;

  const complete = () =>
    showAlert(
      outcome ? 'Complete and publish the outcome?' : 'Complete without an outcome?',
      outcome
        ? `The customer will see the outcome${toDocs ? ` and ${toDocs} file${toDocs === 1 ? ' is' : 's are'} saved to the property’s Documents` : ''}. After this it can no longer be changed.`
        : 'The customer will not get an outcome summary.',
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
        {outcome
          ? 'When the outcome and files are ready, complete the request to publish them to the customer.'
          : 'Save the outcome above first. The customer sees it once you complete.'}
      </Text>
      {problem ? <Banner message={problem} /> : null}
      <Button
        title={outcome ? 'Complete & publish outcome' : 'Complete without an outcome'}
        variant={outcome ? 'primary' : 'secondary'}
        onPress={complete}
        loading={update.isPending}
      />
    </Card>
  );
}

function CompleteVisit({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  const [problem, setProblem] = useState<string | null>(null);
  const hasReport = !!request.report;

  const complete = () =>
    showAlert(
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
    showAlert(
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
              { onError: (err) => showAlert("Couldn't cancel", errorMessage(err)) },
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

/* ---- Paperwork help ----------------------------------------------- */

function StartWorking({ request }: { request: BackofficeRequestDetail }) {
  const update = useBoUpdateRequest(request.id);
  return (
    <Card style={[styles.card, styles.stepCard]}>
      <Text style={typography.heading}>Step 2 of 3 · Work on it</Text>
      <Text style={typography.small}>
        Let the customer know you have started. Ask them below if you need anything.
      </Text>
      <Button
        title="Mark as working on it"
        variant="secondary"
        onPress={() =>
          update.mutate(
            { status: 'in_progress', note: null },
            { onError: (err) => showAlert("Couldn't update", errorMessage(err)) },
          )
        }
        loading={update.isPending}
      />
    </Card>
  );
}

/** "Need info from you": the question goes to the customer's request thread. */
function AskCustomer({ request }: { request: BackofficeRequestDetail }) {
  const ask = useBoAskCustomer(request.id);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = request.status === 'awaiting_customer';

  const send = () => {
    setProblem(null);
    ask.mutate(message.trim(), {
      onSuccess: () => {
        setMessage('');
        showAlert(
          'Sent to the customer',
          'They’ll see “We need something from you” and can reply with files. The request continues when they reply.',
        );
      },
      onError: (err) => setProblem(errorMessage(err)),
    });
  };

  return (
    <Card style={styles.card}>
      <Text style={typography.heading}>
        {waiting ? 'Waiting for the customer' : 'Need something from the customer?'}
      </Text>
      <Text style={typography.small}>
        {waiting
          ? `You asked: “${request.status_note ?? ''}”. Their reply moves this back to “Working on it”.`
          : 'Ask for a document, a login, a confirmation… They reply in the app, with files if needed.'}
      </Text>
      {problem ? <Banner message={problem} /> : null}
      <TextField
        label={waiting ? 'Ask something else' : 'What do you need?'}
        placeholder="e.g. Please share last year’s property tax receipt"
        value={message}
        onChangeText={setMessage}
        maxLength={4000}
        multiline
      />
      <Button
        title="Ask the customer"
        variant="secondary"
        icon="chat"
        onPress={send}
        disabled={message.trim().length < 3}
        loading={ask.isPending}
      />
    </Card>
  );
}

const FILE_DESTINATIONS: { value: DocumentType | 'none'; label: string }[] = [
  ...DOCUMENT_TYPES.map((t) => ({ value: t, label: `Documents · ${DOCUMENT_TYPE_LABELS[t]}` })),
  { value: 'none', label: 'Only on this request' },
];

/** Step 3: the outcome summary and result files (draft until completed). */
function OutcomeEditor({ request }: { request: BackofficeRequestDetail }) {
  const save = useBoSaveOutcome(request.id);
  const removeFile = useBoDeleteOutcomeFile(request.id);
  const qc = useQueryClient();
  const outcome = request.outcome;

  const [summary, setSummary] = useState(outcome?.summary ?? '');
  const [findings, setFindings] = useState(outcome?.findings ?? '');
  const [reference, setReference] = useState(outcome?.reference_number ?? '');
  const [nextDue, setNextDue] = useState<Date | null>(
    outcome?.next_due_date ? fromIsoDate(outcome.next_due_date) : null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = () => {
    setProblem(null);
    if (!summary.trim()) {
      setErrors({ summary: 'Say what was done' });
      return;
    }
    setErrors({});
    save.mutate(
      {
        summary,
        findings,
        reference_number: reference,
        next_due_date: nextDue ? toIsoDate(nextDue) : null,
      },
      {
        onSuccess: () =>
          showAlert(
            'Draft saved',
            'Only staff can see it for now. Add result files, then complete the request to publish it.',
          ),
        onError: (err) => {
          setErrors(fieldErrors(err));
          setProblem(errorMessage(err));
        },
      },
    );
  };

  const addFile = async () => {
    setProblem(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: [...ALLOWED_DOCUMENT_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    let file;
    try {
      file = prepareDocument(asset);
    } catch (err) {
      setProblem(errorMessage(err));
      return;
    }
    const where = request.property
      ? await dialog.actions({
          title: 'Where should it go?',
          message: 'On completion the file is also saved in the property’s Documents.',
          actions: FILE_DESTINATIONS.map((d) => ({ label: d.label, value: d.value })),
        })
      : ('none' as const);
    if (!where) return;
    setUploading(true);
    try {
      await uploadOutcomeFile(request.id, file, where === 'none' ? null : where);
    } catch (err) {
      setProblem(errorMessage(err, "The file couldn't be uploaded."));
    } finally {
      setUploading(false);
      void qc.invalidateQueries({ queryKey: boKeys.request(request.id) });
    }
  };

  const fileActions = (f: OutcomeFile) =>
    showAlert(f.file_name, undefined, [
      {
        text: 'Open',
        onPress: () => {
          if (f.url) void WebBrowser.openBrowserAsync(f.url);
        },
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeFile.mutate(f.id, {
            onError: (err) => showAlert("Couldn't remove", errorMessage(err)),
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Card style={[styles.card, styles.stepCard]}>
      <Text style={typography.heading}>Step 3 of 3 · Outcome</Text>
      <Text style={typography.small}>
        {outcome
          ? 'Draft saved — only staff can see it. You can keep editing until you complete the request.'
          : 'Write what was done. The customer sees it only after you complete the request.'}
      </Text>
      {problem ? <Banner message={problem} /> : null}
      <TextField
        label="What was done"
        multiline
        maxLength={4000}
        value={summary}
        onChangeText={setSummary}
        placeholder="e.g. Paid the 2026–27 property tax on the BBMP portal"
        error={errors.summary}
      />
      <TextField
        label="What we found / good to know"
        optional
        multiline
        maxLength={4000}
        value={findings}
        onChangeText={setFindings}
        placeholder="Arrears, mismatches, anything the owner should act on"
      />
      <TextField
        label="Reference number"
        optional
        maxLength={120}
        value={reference}
        onChangeText={setReference}
        placeholder="Receipt / application / acknowledgement no."
      />
      <DateField
        label="Next due (optional)"
        value={nextDue}
        onChange={setNextDue}
        minimumDate={new Date()}
      />
      <Button
        title={outcome ? 'Save changes' : 'Save outcome'}
        onPress={submit}
        loading={save.isPending}
      />

      <Text style={typography.overline}>Result files</Text>
      {!outcome ? (
        <Text style={typography.caption}>Save the outcome first, then add files.</Text>
      ) : uploading ? (
        <Text style={typography.small}>Uploading…</Text>
      ) : (
        <Button
          title="Add a file"
          variant="secondary"
          icon="attach"
          onPress={() => void addFile()}
        />
      )}
      {outcome ? (
        <>
          <Text style={typography.caption}>What the customer will see:</Text>
          <OutcomeView outcome={outcome} onFilePress={fileActions} draft />
        </>
      ) : null}
    </Card>
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
          showAlert(
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
    showAlert(m.kind === 'video' ? 'Video' : 'Photo', undefined, [
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
            onError: (err) => showAlert("Couldn't delete", errorMessage(err)),
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
          <Button title="Add photos" variant="secondary" icon="images" onPress={addPhotos} />
          <Button title="Add video" variant="secondary" icon="video" onPress={addVideo} />
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
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
  dotNumber: { fontSize: 11, fontWeight: '600', color: colors.textSubtle },
  dotNumberActive: { color: colors.primary },
  stepLabel: { fontSize: 11, color: colors.textSubtle },
  stepLabelOn: { color: colors.text, fontWeight: '600' },
  cancel: { alignSelf: 'center', padding: space.md },
  cancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
