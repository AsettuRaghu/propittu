import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  ticketWaitingNote,
  withoutCodes,
} from '@propittu/shared';
import { useLiveTicket, useReplyTicket, useTicket } from '@/api/support';
import { uploadAll } from '@/components/AttachmentPicker';
import { ChatThread } from '@/components/ChatThread';
import { dialog, toast } from '@/components/Dialog';
import { PullRefresh } from '@/components/PullRefresh';
import { ErrorState, LoadingState } from '@/components/States';
import { Badge, LinkButton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { TICKET_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';

/** One support ticket: what it's about, then the conversation with the reply bar at the bottom. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, isPending, error, refetch, isRefetching } = useTicket(id);
  const reply = useReplyTicket(id);
  useLiveTicket(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ChatThread
      header={
        <View style={styles.head}>
          <View style={styles.row}>
            <Text style={[typography.title, styles.flex]} numberOfLines={2}>
              {withoutCodes(t.subject)}
            </Text>
            <Badge label={TICKET_STATUS_LABELS[t.status]} tone={TICKET_TONES[t.status]} size="lg" />
          </View>
          <Text style={typography.small}>
            {TICKET_CATEGORY_LABELS[t.category]} · raised {formatDate(t.created_at)}
          </Text>
          {t.property || t.service_request ? (
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
          ) : null}
        </View>
      }
      refreshControl={<PullRefresh onRefresh={() => refetch()} />}
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
          const mineLast = [...detail.messages].reverse().find((m) => m.author_type === 'customer');
          if (files.length && mineLast) {
            const failed = await uploadAll('support', id, mineLast.id, files);
            await refetch();
            if (failed)
              toast(`${failed} file${failed === 1 ? '' : 's'} couldn't be uploaded`, 'danger');
          }
          return true;
        } catch (err) {
          void dialog.alert({ title: "Couldn't send", message: errorMessage(err), tone: 'danger' });
          return false;
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    gap: 6,
    paddingBottom: space.md,
    marginBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  links: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap', marginTop: 2 },
});
