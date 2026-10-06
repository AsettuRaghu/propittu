import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  FACT_LABELS,
  formatIndianMobile,
  PITTU_QUESTION_LABELS,
  REVIEW_REASON_LABELS,
  STAFF_ANALYSIS_ERROR_LABELS,
  staffCan,
  type AiFailure,
  type AiSummary,
  type BackofficePittu,
  type PittuQuestionId,
  type PropertyReviewStatus,
  type ReviewListItem,
} from '@propittu/shared';
import {
  useBoAiSummary,
  useBoRetryReading,
  useBoReviewDecision,
  useBoReviews,
} from '@/api/backoffice';
import { useMe } from '@/api/queries';
import { showAlert } from '@/lib/alert';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { colors, space, typography } from '@/theme';
import { TextField } from './Field';
import { PullRefresh } from './PullRefresh';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Badge, Button, Card, Chips, KeyValue, ProgressBar, SectionTitle } from './ui';

const usd = (n: number, dp = 2) => `$${n.toFixed(dp)}`;

/**
 * Backoffice → Pittu: what document reading costs this month, how often
 * customers keep what Pittu read, failed readings, and the Review list.
 */
export function BoPittu() {
  const summary = useBoAiSummary();
  const [status, setStatus] = useState<PropertyReviewStatus>('open');
  const reviews = useBoReviews(status);

  if (summary.isPending) return <LoadingState />;
  if (summary.error) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }
  const s = summary.data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <PullRefresh onRefresh={() => Promise.all([summary.refetch(), reviews.refetch()])} />
      }
    >
      <SpendCard s={s} />
      <AccuracyCard s={s} />

      <View style={styles.section}>
        <SectionTitle
          title="Review list"
          subtitle={s.review_open ? `${s.review_open} waiting` : 'Nothing waiting'}
        />
        <Chips
          options={[
            { value: 'open', label: 'To review' },
            { value: 'done', label: 'Reviewed' },
          ]}
          value={status}
          onChange={setStatus}
        />
        {reviews.isPending ? (
          <LoadingState />
        ) : reviews.error ? (
          <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
        ) : reviews.data.length === 0 ? (
          <EmptyState
            icon="check"
            title={status === 'open' ? 'All clear' : 'Nothing reviewed yet'}
          />
        ) : (
          reviews.data.map((r) => <ReviewRow key={r.property_id} item={r} />)
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Failed readings" subtitle="Last 30 days" />
        {s.failures.length === 0 ? (
          <Text style={typography.small}>No failed readings.</Text>
        ) : (
          s.failures.map((f) => <FailureRow key={f.analysis_id} failure={f} />)
        )}
      </View>

      {s.by_account.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Spend by customer" subtitle="This month" />
          <Card style={styles.card}>
            {s.by_account.map((a) => (
              <View key={a.account_id} style={styles.row}>
                <Text
                  style={[typography.body, styles.flex]}
                  numberOfLines={1}
                  onPress={() => router.push(`/backoffice/accounts/${a.account_id}`)}
                >
                  {a.customer_phone ? formatIndianMobile(a.customer_phone) : 'Unknown'}
                  {a.customer_name ? ` · ${a.customer_name}` : ''}
                </Text>
                <Text style={typography.small}>
                  {a.calls} · {usd(a.cost_usd)}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
    </ScrollView>
  );
}

function SpendCard({ s }: { s: AiSummary }) {
  const share = s.budget_usd > 0 ? Math.min(1, s.spend_usd / s.budget_usd) : 1;
  const tone = share >= 0.9 ? colors.danger : share >= 0.7 ? colors.warning : colors.primary;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={typography.caption}>This month · since {formatDate(s.month_start)}</Text>
        <Badge
          label={s.enabled ? `On · ${s.pilot_accounts || 'all'} pilot` : 'Switched off'}
          tone={s.enabled ? 'success' : 'neutral'}
        />
      </View>
      <Text style={typography.title}>
        {usd(s.spend_usd)} <Text style={typography.small}>of {usd(s.budget_usd)} budget</Text>
      </Text>
      <ProgressBar progress={share} color={tone} />
      <Text style={typography.small}>
        Today {usd(s.today_spend_usd)} · readings stop by themselves when the budget is used up.
      </Text>
      <View style={styles.stats}>
        <Stat label="Readings" value={String(s.calls.ok)} />
        <Stat label="Failed calls" value={String(s.calls.failed)} />
        <Stat label="Avg cost" value={s.avg_cost_usd !== null ? usd(s.avg_cost_usd, 3) : '—'} />
        <Stat label="Avg time" value={s.avg_seconds !== null ? `${s.avg_seconds}s` : '—'} />
      </View>
      <Text style={typography.caption}>
        Tokens: {s.input_tokens.toLocaleString('en-IN')} in ·{' '}
        {s.output_tokens.toLocaleString('en-IN')} out
      </Text>
    </Card>
  );
}

function AccuracyCard({ s }: { s: AiSummary }) {
  const { confirmed, edited, rejected } = s.facts;
  const total = confirmed + edited + rejected;
  return (
    <Card style={styles.card}>
      <Text style={typography.caption}>What customers did with Pittu’s values</Text>
      {total === 0 ? (
        <Text style={typography.small}>No properties confirmed from a deed this month.</Text>
      ) : (
        <>
          <Text style={typography.title}>
            {Math.round((confirmed / total) * 100)}%{' '}
            <Text style={typography.small}>kept as read</Text>
          </Text>
          <Text style={typography.small}>
            {confirmed} kept · {edited} corrected · {rejected} removed
          </Text>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={typography.bodyStrong}>{value}</Text>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

function ReviewRow({ item }: { item: ReviewListItem }) {
  return (
    <Card
      onPress={() => router.push(`/backoffice/properties/${item.property_id}`)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={[typography.bodyStrong, styles.flex]} numberOfLines={1}>
          {item.property_name}
        </Text>
        <Text style={typography.caption}>{formatDate(item.updated_at)}</Text>
      </View>
      <Text style={typography.small}>
        {item.customer_phone ? formatIndianMobile(item.customer_phone) : 'Unknown customer'}
      </Text>
      <View style={styles.badges}>
        {item.reasons.map((r) => (
          <Badge key={r} label={REVIEW_REASON_LABELS[r]} tone="warning" />
        ))}
      </View>
      {item.note ? <Text style={typography.small}>Note: {item.note}</Text> : null}
    </Card>
  );
}

function FailureRow({ failure }: { failure: AiFailure }) {
  const me = useMe();
  const retry = useBoRetryReading();
  const canRetry = failure.can_retry && staffCan(me.data?.staff_role, 'documents.review');
  const code = failure.error_code ?? 'failed';

  const confirmRetry = () =>
    showAlert(
      'Read this deed again?',
      'Pittu will read it once more. This costs about $0.06–0.10.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Read again',
          onPress: () =>
            retry.mutate(failure.analysis_id, {
              onError: (err) => showAlert("Couldn't start the reading", errorMessage(err)),
            }),
        },
      ],
    );

  return (
    <Card
      onPress={() => router.push(`/backoffice/accounts/${failure.account_id}`)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={[typography.bodyStrong, styles.flex]} numberOfLines={1}>
          {failure.property_name}
        </Text>
        {failure.is_draft ? <Badge label="Draft" /> : null}
      </View>
      <Text style={typography.small}>
        {STAFF_ANALYSIS_ERROR_LABELS[code] ?? code} · {failure.attempts}{' '}
        {failure.attempts === 1 ? 'try' : 'tries'} · {formatDate(failure.updated_at)}
      </Text>
      <Text style={typography.caption}>
        {failure.customer_phone ? formatIndianMobile(failure.customer_phone) : 'Unknown customer'}
      </Text>
      {canRetry ? (
        <Button
          title="Read again"
          variant="secondary"
          icon="refresh"
          loading={retry.isPending}
          disabled={retry.isSuccess}
          onPress={confirmRetry}
        />
      ) : null}
      {retry.isSuccess ? <Text style={typography.caption}>Queued — pull to refresh.</Text> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Staff property screen: Pittu section
 * ------------------------------------------------------------------ */

const factText = (key: string, v: unknown): string =>
  v === null || v === undefined || v === ''
    ? '—'
    : Array.isArray(v)
      ? v.join(', ')
      : key === 'sale_consideration_inr'
        ? `₹${Number(v).toLocaleString('en-IN')}`
        : String(v);

const answerText = (a: string) => (a.charAt(0).toUpperCase() + a.slice(1)).replace(/_/g, ' ');

export function BoPropertyPittu({
  propertyId,
  pittu,
}: {
  propertyId: string;
  pittu: BackofficePittu;
}) {
  const me = useMe();
  const decide = useBoReviewDecision(propertyId);
  const canReview = staffCan(me.data?.staff_role, 'documents.review');
  const { review } = pittu;
  const [note, setNote] = useState(review?.note ?? '');
  const answers = Object.entries(pittu.answers) as [PittuQuestionId, string][];

  const submit = (status: PropertyReviewStatus) =>
    decide.mutate(
      { status, note: note.trim() },
      { onError: (err) => showAlert("Couldn't save the review", errorMessage(err)) },
    );

  return (
    <View style={styles.section}>
      <SectionTitle title="Pittu" subtitle="Added from the sale deed" />

      {review ? (
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={typography.bodyStrong}>Review</Text>
            <Badge
              label={review.status === 'open' ? 'To review' : 'Reviewed'}
              tone={review.status === 'open' ? 'warning' : 'success'}
            />
          </View>
          <View style={styles.badges}>
            {review.reasons.map((r) => (
              <Badge key={r} label={REVIEW_REASON_LABELS[r]} tone="warning" />
            ))}
          </View>
          {review.reviewed_at && review.status === 'done' ? (
            <Text style={typography.caption}>Reviewed {formatDate(review.reviewed_at)}</Text>
          ) : null}
          {canReview ? (
            <>
              <TextField
                label="Note"
                optional
                placeholder="e.g. Called the customer — buying for their mother"
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
              />
              {review.status === 'open' ? (
                <Button
                  title="Mark reviewed"
                  icon="check"
                  loading={decide.isPending}
                  onPress={() => submit('done')}
                />
              ) : (
                <Button
                  title="Reopen"
                  variant="secondary"
                  loading={decide.isPending}
                  onPress={() => submit('open')}
                />
              )}
            </>
          ) : review.note ? (
            <Text style={typography.small}>Note: {review.note}</Text>
          ) : null}
        </Card>
      ) : null}

      {answers.length > 0 ? (
        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>Customer’s answers</Text>
          {answers.map(([q, a]) => (
            <KeyValue key={q} label={PITTU_QUESTION_LABELS[q] ?? q} value={answerText(a)} />
          ))}
        </Card>
      ) : null}

      {pittu.facts.length > 0 ? (
        <Card style={styles.card}>
          <Text style={typography.bodyStrong}>Read from the deed</Text>
          {pittu.facts.map((f) => (
            <View key={f.key} style={styles.fact}>
              <View style={styles.row}>
                <Text style={typography.caption}>
                  {FACT_LABELS[f.key] ?? f.key.replace(/_/g, ' ')}
                  {f.pages.length ? ` · p. ${f.pages.join(', ')}` : ''}
                </Text>
                <View style={styles.badges}>
                  {f.confidence === 'low' || f.confidence === 'medium' ? (
                    <Badge
                      label={`${f.confidence} confidence`}
                      tone={f.confidence === 'low' ? 'danger' : 'warning'}
                    />
                  ) : null}
                  {f.status === 'edited' ? <Badge label="Corrected" tone="info" /> : null}
                  {f.status === 'rejected' ? <Badge label="Removed" /> : null}
                </View>
              </View>
              <Text style={typography.body}>
                {f.status === 'edited'
                  ? `${factText(f.key, f.value)} → ${factText(f.key, f.final_value)}`
                  : factText(f.key, f.value)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  section: { gap: space.sm },
  card: { gap: space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  stats: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.xs },
  stat: { alignItems: 'center', gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  fact: { gap: 2 },
});
