import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS, ticketWaitingNote } from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useReplyTicket, useTicket } from '@/api/support';
import { uploadAll } from '@/components/AttachmentPicker';
import { dialog, toast } from '@/components/Dialog';
import { ErrorState, LoadingState } from '@/components/States';
import { ChatThread } from '@/components/ChatThread';
import { Badge, Card, LinkButton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { space, typography } from '@/theme';
import { TICKET_TONES } from '@/lib/icons';

/** One support ticket: status, what it's about, and the conversation. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, isPending, error, refetch, isRefetching } = useTicket(id);
  const reply = useReplyTicket(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
    >
      <Card style={styles.head}>
        <View style={styles.row}>
          <Text style={[typography.heading, styles.flex]} numberOfLines={2}>
            {t.subject}
          </Text>
          <Badge label={TICKET_STATUS_LABELS[t.status]} tone={TICKET_TONES[t.status]} />
        </View>
        <Text style={typography.small}>
          {TICKET_CATEGORY_LABELS[t.category]} · raised {formatDate(t.created_at)}
        </Text>
        <View style={styles.links}>
          {t.property ? (
            <LinkButton
              title={t.property.name}
              icon="home"
              onPress={() => router.push(`/properties/${t.property?.id}`)}
            />
          ) : null}
          {t.service_request ? (
            <LinkButton
              title={t.service_request.service?.name ?? 'Service request'}
              icon="requests"
              onPress={() => router.push(`/requests/${t.service_request?.id}`)}
            />
          ) : null}
        </View>
      </Card>

      <ChatThread
        messages={t.messages}
        mine="customer"
        notice={ticketWaitingNote(t)}
        sending={reply.isPending || isRefetching}
        closedNote={
          t.status === 'closed'
            ? 'This ticket is closed. Raise a new one if you still need help.'
            : null
        }
        onSend={async (body, files) => {
          try {
            const detail = await reply.mutateAsync(body);
            const mineLast = [...detail.messages]
              .reverse()
              .find((m) => m.author_type === 'customer');
            if (files.length && mineLast) {
              const failed = await uploadAll('support', id, mineLast.id, files);
              await refetch();
              if (failed)
                toast(`${failed} file${failed === 1 ? '' : 's'} couldn't be uploaded`, 'danger');
            }
            return true;
          } catch (err) {
            void dialog.alert({
              title: "Couldn't send",
              message: errorMessage(err),
              tone: 'danger',
            });
            return false;
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  head: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  links: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
});
