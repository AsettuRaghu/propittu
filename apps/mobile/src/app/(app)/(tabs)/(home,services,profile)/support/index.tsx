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
} from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useTickets } from '@/api/support';
import { dialog } from '@/components/Dialog';
import { Icon, type IconName } from '@/components/Icon';
import { Badge, IconTile, ListGroup, ListRow, SectionTitle } from '@/components/ui';
import { TICKET_TONES } from '@/lib/icons';
import { formatDate } from '@/lib/format';
import { colors, radius, shadow, space, typography, type Accent } from '@/theme';

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

/** Help & Support: reach us · open tickets (resolved ones folded away) · FAQs. */
export default function SupportScreen() {
  const tickets = useTickets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const email = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Propittu support')}`;
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) await Linking.openURL(url);
    else
      void dialog.alert({
        title: 'Email us',
        message: `Write to ${SUPPORT_EMAIL} — we usually reply within a working day.`,
        icon: 'mail',
      });
  };

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
        <SectionTitle title="Reach us" />
        <View style={styles.reach}>
          <Reach
            icon="mail"
            accent="sky"
            title="Email us"
            subtitle={SUPPORT_EMAIL}
            onPress={() => void email()}
          />
          <Reach
            icon="requests"
            accent="indigo"
            title="Raise a ticket"
            subtitle="Track the reply here"
            onPress={() => router.push('/support/new')}
          />
          {SUPPORT_PHONE ? (
            <Reach
              icon="phone"
              accent="teal"
              title="Call us"
              subtitle="Mon–Sat, 9–7"
              onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)}
            />
          ) : null}
        </View>
      </View>

      <View>
        <SectionTitle title="Open tickets" />
        {open.length === 0 ? (
          <Text style={[typography.small, styles.none]}>
            {tickets.isPending ? 'Loading…' : 'No open tickets — raise one any time.'}
          </Text>
        ) : (
          <TicketList tickets={open} />
        )}
        {closed.length > 0 ? (
          <>
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowClosed((v) => !v);
              }}
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
            {showClosed ? <TicketList tickets={closed} /> : null}
          </>
        ) : null}
      </View>

      <View>
        <SectionTitle title="FAQs" />
        <ListGroup>
          {FAQS.map((f, i) => (
            <Pressable
              key={f.q}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpenFaq(openFaq === i ? null : i);
              }}
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
      </View>
    </ScrollView>
  );
}

function TicketList({ tickets }: { tickets: SupportTicket[] }) {
  return (
    <ListGroup>
      {tickets.map((t) => (
        <ListRow
          key={t.id}
          title={t.subject}
          subtitle={`Raised ${formatDate(t.created_at)}`}
          right={<Badge label={TICKET_STATUS_LABELS[t.status]} tone={TICKET_TONES[t.status]} />}
          onPress={() => router.push(`/support/${t.id}`)}
        />
      ))}
    </ListGroup>
  );
}

function Reach({
  icon,
  accent,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  accent: Accent;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.reachTile, shadow, pressed && { opacity: 0.85 }]}
    >
      <IconTile icon={icon} accent={accent} size={34} />
      <Text style={typography.bodyStrong}>{title}</Text>
      <Text style={typography.caption}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  reach: { flexDirection: 'row', gap: space.sm },
  reachTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 4,
  },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.md,
  },
  closedText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  none: { paddingHorizontal: space.xs },
  faq: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
