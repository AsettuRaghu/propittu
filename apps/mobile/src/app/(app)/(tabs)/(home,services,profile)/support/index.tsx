import { router } from 'expo-router';
import { useState } from 'react';
import {
  LayoutAnimation,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  OPEN_TICKET_STATUSES,
  SUPPORT_EMAIL,
  TICKET_STATUS_LABELS,
  type SupportTicket,
  withoutCodes,
} from '@propittu/shared';
import { useTickets } from '@/api/support';
import { Icon } from '@/components/Icon';
import { PullRefresh } from '@/components/PullRefresh';
import { PageHeader, Strong } from '@/components/PageHeader';
import { LoadingState } from '@/components/States';
import { Badge, Button, ListGroup, ListRow } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { TICKET_TONES } from '@/lib/icons';
import { colors, space, typography } from '@/theme';

/** Customer care number, configured per environment (EXPO_PUBLIC_SUPPORT_PHONE). */
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I upload a document?',
    a: 'Open the property, then tap a document slot (Sale deed, Registration, Property tax or Other) and choose the file. PDF, JPG and PNG up to 10 MB.',
  },
  {
    q: 'How do I book a property visit?',
    a: 'Go to Services → Property Visit, pick the property and a preferred day and time. We confirm the slot and share a report with photos after the visit.',
  },
  {
    q: 'What does my plan include?',
    a: 'Profile → Plan & Usage shows your limits, what you have used, included visits left and your payments.',
  },
  {
    q: 'Is my data safe if my plan ends?',
    a: 'Yes. Nothing is deleted. You can see your plan and payments, and everything comes back as soon as you choose a plan.',
  },
  {
    q: 'How do payments work?',
    a: 'Plans and extra services are paid securely by UPI or card through Razorpay. Extra services are paid only after we confirm them.',
  },
];

/** Closed tickets stay listed for 30 days after they close. */
const RECENT_DAYS = 30;

/**
 * Help & Support, laid out like Plan & Usage: a "Tickets" header with the
 * Raise a ticket button, the open and recently closed tickets (collapsible),
 * then Contact us and FAQs as headed, indented sections. Shown once tickets
 * have loaded, so nothing jumps.
 */
export default function SupportScreen() {
  const tickets = useTickets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showTickets, setShowTickets] = useState(true);
  const [since] = useState(() => Date.now() - RECENT_DAYS * 86_400_000);
  const toggle = (fn: () => void) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    fn();
  };

  if (tickets.isPending) return <LoadingState />;
  const all = tickets.data ?? [];
  const open = all.filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const recent = all.filter(
    (t) =>
      !OPEN_TICKET_STATUSES.includes(t.status) &&
      new Date(t.resolved_at ?? t.last_message_at).getTime() >= since,
  );
  const listed = [...open, ...recent];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => tickets.refetch()} />}
    >
      <View>
        <PageHeader
          title="Tickets"
          subtitle={
            open.length ? (
              <>
                <Strong>{open.length} open</Strong> · we reply within 1–3 working days
              </>
            ) : (
              'We reply within 1–3 working days'
            )
          }
          action={
            <Button
              title="Raise a ticket"
              icon="add"
              size="sm"
              onPress={() => router.push('/support/new')}
            />
          }
        />
        {listed.length > 0 ? (
          <>
            <Pressable
              onPress={() => toggle(() => setShowTickets((v) => !v))}
              accessibilityRole="button"
              accessibilityState={{ expanded: showTickets }}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>
                {showTickets ? 'Hide' : 'Show'} tickets ({listed.length})
              </Text>
              <Icon
                name={showTickets ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={colors.textMuted}
              />
            </Pressable>
            {showTickets ? (
              <ListGroup plain>
                {listed.map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : (
          <Text style={[typography.small, styles.none]}>No tickets in the last 30 days.</Text>
        )}
      </View>

      <ListGroup title="Contact us" plain>
        <ListRow icon="mail" accent="sky" title={SUPPORT_EMAIL} subtitle="Write to us any time" />
        {SUPPORT_PHONE ? (
          <ListRow
            icon="phone"
            accent="teal"
            title={SUPPORT_PHONE}
            subtitle="Mon–Sat, 9 am – 7 pm"
            onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)}
          />
        ) : null}
      </ListGroup>

      <ListGroup title="FAQs" plain>
        {FAQS.map((f, i) => (
          <Pressable
            key={f.q}
            onPress={() => toggle(() => setOpenFaq(openFaq === i ? null : i))}
            accessibilityRole="button"
            style={styles.faq}
          >
            <View style={styles.faqRow}>
              <Text style={[typography.bodyStrong, styles.flex]}>{f.q}</Text>
              <Icon
                name={openFaq === i ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textSubtle}
              />
            </View>
            {openFaq === i ? <Text style={typography.small}>{f.a}</Text> : null}
          </Pressable>
        ))}
      </ListGroup>
    </ScrollView>
  );
}

function TicketRow({ ticket: t }: { ticket: SupportTicket }) {
  return (
    <ListRow
      title={withoutCodes(t.subject)}
      subtitle={`Raised ${formatDate(t.created_at)}`}
      right={<Badge label={TICKET_STATUS_LABELS[t.status]} tone={TICKET_TONES[t.status]} />}
      onPress={() => router.push(`/support/${t.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.md, gap: space.xl, paddingBottom: space.xxl },
  none: { paddingVertical: space.md },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  faq: { paddingHorizontal: 14, paddingVertical: 14, gap: 6 },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
