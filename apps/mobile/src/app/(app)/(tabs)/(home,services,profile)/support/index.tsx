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
import { LoadingState } from '@/components/States';
import { Badge, ListGroup, ListRow } from '@/components/ui';
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

/**
 * Help & Support, flat like Profile: your tickets (with "Raise a ticket"
 * as the first row) · contact · FAQs. Shown once tickets have loaded, so
 * nothing below jumps when they arrive.
 */
export default function SupportScreen() {
  const tickets = useTickets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const toggle = (fn: () => void) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    fn();
  };

  if (tickets.isPending) return <LoadingState />;
  const all = tickets.data ?? [];
  const open = all.filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const closed = all.filter((t) => !OPEN_TICKET_STATUSES.includes(t.status));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => tickets.refetch()} />}
    >
      <View>
        <ListGroup title="Your tickets" plain>
          <ListRow
            icon="add"
            title="Raise a ticket"
            subtitle="We reply in the app within 1–3 working days"
            onPress={() => router.push('/support/new')}
          />
          {open.map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
        </ListGroup>
        {closed.length > 0 ? (
          <>
            <Pressable
              onPress={() => toggle(() => setShowClosed((v) => !v))}
              accessibilityRole="button"
              style={styles.closedToggle}
            >
              <Text style={styles.closedText}>Resolved &amp; closed ({closed.length})</Text>
              <Icon
                name={showClosed ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={colors.textMuted}
              />
            </Pressable>
            {showClosed ? (
              <ListGroup plain>
                {closed.map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : null}
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
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.md,
  },
  closedText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  faq: { paddingHorizontal: 14, paddingVertical: 14, gap: 6 },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
