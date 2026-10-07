import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  carePlan,
  documentChecklist,
  reachProblem,
  type CareItem,
  type PittuState,
} from '@propittu/shared';
import { api } from '@/api/client';
import { useProperty, useServices } from '@/api/queries';
import { errorMessage } from '@/lib/errors';
import { colors, font, gradients, radius, shadow, space, typography } from '@/theme';
import { toast } from './Dialog';
import { Footer } from './Footer';
import { Icon } from './Icon';
import { Banner, Button, LinkButton, ListGroup, ListRow } from './ui';

/**
 * After Pittu's questions (and whenever reopened from the property page):
 * only what needs doing. Documents still to add, and Pittu's care plan —
 * services suggested from the answers, each with its reason, requested in
 * one go. Documents already in the locker are not listed; with nothing to
 * do, it says so.
 */
export function PittuCarePlan({
  propertyId,
  state,
  reply,
}: {
  propertyId: string;
  state: PittuState;
  /** Pittu's reply to the last answer, if one was just given. */
  reply: string | null;
}) {
  const property = useProperty(propertyId);
  const services = useServices();
  // Reopened from the property page: back to it. Straight after adding: the property, welcomed.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const finish = () =>
    from === 'property'
      ? router.back()
      : router.replace({ pathname: '/properties/[id]', params: { id: propertyId, welcome: '1' } });

  // Only services that can reach this property (PIN code / state).
  const plan = carePlan(state.context, state.answers).filter((item) => {
    const service = (services.data ?? []).find((s) => s.code === item.service_code);
    return !service || !reachProblem(service, property.data?.reach);
  });
  const missing = documentChecklist(state.context).filter((d) => !d.have);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = plan.filter((p) => !off[p.service_code]);

  const send = async () => {
    setSending(true);
    setProblem(null);
    let sent = 0;
    for (const item of chosen) {
      const service = (services.data ?? []).find((s) => s.code === item.service_code);
      if (!service || service.coverage === 'unavailable') continue;
      try {
        await api('/service-requests', {
          method: 'POST',
          body: {
            property_id: propertyId,
            service_id: service.id,
            description: `${item.title} — suggested by Pittu. ${item.because}.`,
            preferred_date: null,
          },
        });
        sent++;
      } catch (err) {
        setProblem(errorMessage(err, `Couldn't request ${item.title}.`));
      }
    }
    setSending(false);
    toast(sent ? `${sent} service${sent === 1 ? '' : 's'} requested` : 'Property saved');
    finish();
  };

  const nothing = plan.length === 0 && missing.length === 0;
  const summary = [
    plan.length ? `${plan.length} service${plan.length === 1 ? '' : 's'} Pittu suggests` : null,
    missing.length
      ? `${missing.length} document${missing.length === 1 ? '' : 's'} to add`
      : 'Key documents all in your locker',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: gradients.brand[0] },
          headerTintColor: '#FFFFFF',
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[gradients.brand[0], gradients.brand[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.eyebrow}>
            <Icon name="sparkles" size={14} color="#FFFFFF" />
            <Text style={styles.eyebrowText}>Pittu’s care plan</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {property.data?.name ?? 'Your property'}
          </Text>
          <Text style={styles.summary}>{nothing ? 'Nothing needs your attention' : summary}</Text>
          {reply ? (
            <View style={styles.reply}>
              <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} />
              <Text style={styles.replyText}>{reply}</Text>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.body}>
          {missing.length > 0 ? (
            <ListGroup title={`Still to add · ${missing.length}`} plain>
              {missing.map((d) => (
                <ListRow
                  key={d.document_type}
                  icon="document"
                  accent="amber"
                  title={d.label}
                  subtitle={d.hint}
                  subtitleLines={2}
                  showChevron={false}
                  right={
                    <LinkButton
                      title="Upload"
                      onPress={() =>
                        router.push({
                          pathname: '/properties/[id]/add-document',
                          params: { id: propertyId, type: d.document_type },
                        })
                      }
                    />
                  }
                />
              ))}
            </ListGroup>
          ) : null}

          {plan.length > 0 ? (
            <ListGroup title="Pittu suggests" plain>
              <Text style={[typography.small, styles.lead]}>
                Based on your answers. Untick anything you don’t need.
              </Text>
              <View style={styles.cards}>
                {plan.map((p) => (
                  <CareCard
                    key={p.service_code}
                    item={p}
                    on={!off[p.service_code]}
                    onToggle={() => setOff((o) => ({ ...o, [p.service_code]: !o[p.service_code] }))}
                  />
                ))}
              </View>
              {problem ? <Banner message={problem} /> : null}
              <Text style={[typography.caption, styles.lead]}>
                Included services use your plan; others are priced before you pay — nothing is
                charged until we confirm.
              </Text>
            </ListGroup>
          ) : null}

          {nothing ? (
            <View style={styles.calm}>
              <Icon name="verified" size={40} color={colors.primary} strokeWidth={1.8} />
              <Text style={[typography.title, styles.center]}>All looked after</Text>
              <Text style={[typography.small, styles.center]}>
                Your key documents are in your locker and nothing needs doing right now. Pittu will
                suggest something when it does.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Footer>
        {plan.length > 0 ? (
          <>
            <Button
              title={
                chosen.length
                  ? `Request ${chosen.length} service${chosen.length === 1 ? '' : 's'}`
                  : 'Done'
              }
              onPress={() => (chosen.length ? void send() : finish())}
              loading={sending}
            />
            <Button title="Decide later" variant="ghost" onPress={finish} />
          </>
        ) : (
          <Button
            title={from === 'property' ? 'Back to my property' : 'Go to my property'}
            onPress={finish}
          />
        )}
      </Footer>
    </View>
  );
}

function CareCard({ item, on, onToggle }: { item: CareItem; on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.care, shadow, on && styles.careOn]}
    >
      <View style={styles.flex}>
        <Text style={typography.heading}>{item.title}</Text>
        <Text style={typography.small}>{item.reason}</Text>
        <Text style={typography.caption}>{item.because}</Text>
        {item.legal ? (
          <Text style={styles.legal}>Reviewed by our team, with a lawyer where needed.</Text>
        ) : null}
      </View>
      <View style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  scroll: { paddingBottom: space.xl },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.xs,
  },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: {
    fontSize: font(13),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  title: { fontSize: font(26), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  summary: { fontSize: font(15), color: 'rgba(255,255,255,0.9)' },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: space.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  replyText: { fontSize: font(13), fontWeight: '600', color: '#FFFFFF', flexShrink: 1 },
  body: { padding: space.lg, paddingTop: space.xl, gap: space.xl },
  lead: { paddingHorizontal: 14 },
  cards: { gap: space.md, paddingHorizontal: 2, paddingVertical: space.xs },
  calm: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  care: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  careOn: { borderColor: colors.primary },
  legal: { fontSize: font(12), fontWeight: '600', color: colors.warning, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
