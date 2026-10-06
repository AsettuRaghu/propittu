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
import { OPEN_TICKET_STATUSES, SUPPORT_EMAIL, TICKET_STATUS_LABELS } from '@propittu/shared';
import { PullRefresh } from '@/components/PullRefresh';
import { useTickets } from '@/api/support';
import { dialog } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { Badge, ListGroup, ListRow, SectionTitle } from '@/components/ui';
import { TICKET_TONES } from '@/lib/icons';
import { formatDate } from '@/lib/format';
import { colors, radius, shadow, space, typography } from '@/theme';

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

/** Help & Support: call, email, raise a ticket, follow tickets, FAQs. */
export default function SupportScreen() {
  const tickets = useTickets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

  const active = (tickets.data ?? []).filter((t) => OPEN_TICKET_STATUSES.includes(t.status));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<PullRefresh onRefresh={() => tickets.refetch()} />}
    >
      <View style={[styles.hero, shadow]}>
        <Text style={typography.heading}>We&apos;re here to help</Text>
        <Text style={typography.small}>
          Talk to us, or raise a ticket and follow it right here.
        </Text>
      </View>

      <ListGroup>
        {SUPPORT_PHONE ? (
          <ListRow
            icon="phone"
            accent="teal"
            title="Call us"
            subtitle={`${SUPPORT_PHONE} · Mon–Sat, 9 am – 7 pm`}
            onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)}
          />
        ) : null}
        <ListRow
          icon="mail"
          accent="sky"
          title="Email us"
          subtitle={`${SUPPORT_EMAIL} · replies within a day`}
          onPress={() => void email()}
        />
        <ListRow
          icon="requests"
          accent="indigo"
          title="Raise a support ticket"
          subtitle="Tell us what's wrong and track the reply"
          onPress={() => router.push('/support/new')}
        />
      </ListGroup>

      <View>
        <SectionTitle
          title="Your tickets"
          subtitle={active.length ? `${active.length} open` : undefined}
        />
        {(tickets.data ?? []).length === 0 ? (
          <Text style={[typography.small, styles.none]}>No tickets yet. Raise one any time.</Text>
        ) : (
          <ListGroup>
            {(tickets.data ?? []).map((t) => (
              <ListRow
                key={t.id}
                title={t.subject}
                subtitle={`${t.reference} · ${formatDate(t.last_message_at)}`}
                right={
                  <Badge label={TICKET_STATUS_LABELS[t.status]} tone={TICKET_TONES[t.status]} />
                }
                onPress={() => router.push(`/support/${t.id}`)}
              />
            ))}
          </ListGroup>
        )}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.lg, paddingBottom: space.xxl },
  hero: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, gap: 2 },
  none: { paddingHorizontal: space.xs },
  faq: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  faqRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
