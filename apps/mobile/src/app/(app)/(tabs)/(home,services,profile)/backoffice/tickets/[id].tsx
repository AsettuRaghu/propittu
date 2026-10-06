import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatIndianMobile,
  staffCan,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useMe } from '@/api/queries';
import { useBoReplyTicket, useBoTicket, useBoTicketStatus } from '@/api/support';
import { uploadAll } from '@/components/AttachmentPicker';
import { dialog, toast } from '@/components/Dialog';
import { ErrorState, LoadingState } from '@/components/States';
import { TicketThread } from '@/components/TicketThread';
import { Badge, Card, Chips, ListGroup, ListRow, SectionTitle } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { TICKET_TONES } from '@/lib/icons';
import { space, typography } from '@/theme';

/** Backoffice: one support ticket with the customer's context. */
export default function BoTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, isPending, error, refetch } = useBoTicket(id);
  const me = useMe();
  const reply = useBoReplyTicket(id);
  const setStatus = useBoTicketStatus(id);

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const canManage = staffCan(me.data?.staff_role, 'support.manage');
  const fail = (title: string) => (err: unknown) =>
    void dialog.alert({ title, message: errorMessage(err), tone: 'danger' });

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
          {t.reference} · {TICKET_CATEGORY_LABELS[t.category]} · opened {formatDate(t.created_at)}
        </Text>
      </Card>

      <ListGroup>
        <ListRow
          icon="user"
          accent="indigo"
          title={
            t.customer_name ??
            (t.customer_phone ? formatIndianMobile(t.customer_phone) : 'Customer')
          }
          subtitle={
            t.customer_name && t.customer_phone
              ? formatIndianMobile(t.customer_phone)
              : 'View account, plan and usage'
          }
          onPress={() => router.push(`/backoffice/accounts/${t.account_id}`)}
        />
        {t.property ? (
          <ListRow
            icon="home"
            accent="teal"
            title={t.property.name}
            subtitle="Property"
            onPress={() => router.push(`/backoffice/properties/${t.property?.id}`)}
          />
        ) : null}
        {t.service_request ? (
          <ListRow
            icon="requests"
            accent="coral"
            title={t.service_request.reference}
            subtitle="Service request"
            onPress={() => router.push(`/backoffice/requests/${t.service_request?.id}`)}
          />
        ) : null}
      </ListGroup>

      {canManage ? (
        <View>
          <SectionTitle title="Status" />
          <Chips
            options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))}
            value={t.status}
            onChange={(s) =>
              setStatus.mutate(s, {
                onSuccess: () => toast(`Marked ${TICKET_STATUS_LABELS[s].toLowerCase()}`),
                onError: fail("Couldn't update"),
              })
            }
          />
        </View>
      ) : null}

      <View>
        <SectionTitle title="Conversation" />
        <TicketThread
          messages={t.messages}
          mine="staff"
          sending={reply.isPending}
          closedNote={!canManage ? 'Your staff role can view but not reply to tickets.' : null}
          onSend={async (body, files) => {
            try {
              const detail = await reply.mutateAsync(body);
              const mineLast = [...detail.messages]
                .reverse()
                .find((m) => m.author_type === 'staff');
              if (files.length && mineLast) {
                const failed = await uploadAll('backoffice', id, mineLast.id, files);
                await refetch();
                if (failed)
                  toast(`${failed} file${failed === 1 ? '' : 's'} couldn't be uploaded`, 'danger');
              }
              return true;
            } catch (err) {
              fail("Couldn't send")(err);
              return false;
            }
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.xxl },
  head: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
});
