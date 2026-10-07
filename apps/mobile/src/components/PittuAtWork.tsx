import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ANALYSIS_ERROR_LABELS,
  hasUsefulPrefill,
  prefillFromFacts,
  type DocumentAnalysis,
} from '@propittu/shared';
import { useAnalysis, useRemoveDraft } from '@/api/ai';
import { font, space } from '@/theme';
import { DeedArt } from './DeedArt';
import { Beckon, CelebrationBadge, FadeSwap } from './Celebration';
import { feedHeadline, PittuFeed, usePittuFeed } from './DeedReading';
import { Icon, type IconName } from './Icon';
import { Button, ProgressBar } from './ui';

/** Add property's phases once a deed is chosen (the start screen owns them). */
export type PittuPhase =
  | { kind: 'uploading'; progress: number }
  | { kind: 'handing' }
  | { kind: 'reading'; propertyId: string; documentId: string };

/** How a reading ended, from the customer's side. */
type Ending =
  | 'findings' // details found: show them, then Check and save
  | 'duplicate' // already in the locker
  | 'nothing' // read, but nothing about a property in it
  | 'not_deed' // not a sale deed
  | 'later' // Pittu is resting / today's readings used up: the deed can wait
  | 'unreadable'; // couldn't be read (too large, or failed): fill in by hand, deed kept

function endingOf(a: DocumentAnalysis | undefined): Ending | null {
  if (!a || a.status === 'queued' || a.status === 'reading') return null;
  if (a.status === 'ready') {
    if (a.duplicate_of) return 'duplicate';
    return a.facts.length > 0 && hasUsefulPrefill(prefillFromFacts(a.facts))
      ? 'findings'
      : 'nothing';
  }
  if (a.error_code === 'not_a_sale_deed') return 'not_deed';
  if (a.error_code === 'unavailable' || a.error_code === 'daily_limit') return 'later';
  return 'unreadable';
}

/**
 * The deed is in: uploading, then Pittu reading (the deed shrinks to the
 * top and the commentary runs), then how it ended — the findings, or an
 * honest answer with the way forward right there: try another file, or
 * enter the details yourself. A file that isn't a deed is cleared away, so
 * it never waits on Home.
 */
export function PittuAtWork({
  phase,
  bottomInset,
  onReset,
  onManual,
}: {
  phase: PittuPhase;
  bottomInset: number;
  /** Back to the start screen (to try another file). */
  onReset: () => void;
  onManual: () => void;
}) {
  const documentId = phase.kind === 'reading' ? phase.documentId : undefined;
  const analysis = useAnalysis(documentId);
  const a = analysis.data;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!documentId) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [documentId]);

  const ending = endingOf(a);
  const result =
    ending === 'findings' && a ? { prefill: prefillFromFacts(a.facts), facts: a.facts } : null;
  const feed = usePittuFeed(elapsed, result);
  const headline = feedHeadline(feed);

  // Stage 0 → 1: the deed shrinks to the top as soon as Pittu takes over (still
  // reading, still alive). 1 → 2: done — room for the celebration, centre stage.
  const celebrating = ending === 'findings' || ending === 'duplicate';
  const [stage] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(stage, {
      toValue: celebrating ? 2 : 1,
      duration: 600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [stage, celebrating]);

  const removeDraft = useRemoveDraft();
  const duplicate = ending === 'duplicate' ? a?.duplicate_of : null;

  const next = (asNew = false) => {
    if (phase.kind !== 'reading') return;
    router.replace({
      pathname: '/properties/[id]/setup',
      params: { id: phase.propertyId, doc: phase.documentId, ...(asNew ? { asNew: '1' } : {}) },
    });
  };
  // Clear this attempt (the file isn't needed), then go on.
  const clearThen = async (then: () => void) => {
    if (phase.kind === 'reading') {
      await removeDraft.mutateAsync(phase.propertyId).catch(() => undefined);
    }
    then();
  };
  const openExisting = () =>
    clearThen(() => {
      router.dismissTo('/');
      if (duplicate) router.push(`/properties/${duplicate.id}`);
    });

  const words: Record<Ending, { title: string; text: string }> = {
    findings: headline,
    duplicate: { title: 'Pittu knows this deed', text: 'Recognised straight away' },
    nothing: { title: 'Pittu came up empty', text: 'Nothing in this file looked like a property' },
    not_deed: { title: 'That’s not a sale deed', text: 'Pittu reads sale deeds only, for now' },
    later: { title: 'Pittu needs a break', text: 'Your deed is safe — it can wait' },
    unreadable: { title: 'Pittu couldn’t read this one', text: 'No problem — you can fill it in' },
  };
  const title = ending ? words[ending].title : headline.title;
  const text =
    phase.kind === 'uploading'
      ? `Uploading securely… ${Math.round(phase.progress * 100)}%`
      : phase.kind === 'handing'
        ? 'Handing it to Pittu…'
        : ending
          ? words[ending].text
          : headline.text;

  // The way forward for each ending: the main button and a quieter second choice.
  const actions: Record<
    Exclude<Ending, 'findings'>,
    { main: [string, () => void]; alt: [string, () => void] }
  > = {
    duplicate: {
      main: [`Open ${duplicate?.name ?? 'it'}`, () => void openExisting()],
      alt: ['It’s a different property — add it as new', () => next(true)],
    },
    nothing: {
      main: ['Try another file', () => void clearThen(onReset)],
      alt: ['Enter the details myself', () => void clearThen(onManual)],
    },
    not_deed: {
      main: ['Try another file', () => void clearThen(onReset)],
      alt: ['Enter the details myself', () => void clearThen(onManual)],
    },
    later: {
      main: ['Enter the details now', () => next()],
      alt: ['Leave it for later — it’ll wait on Home', () => router.dismissTo('/')],
    },
    unreadable: {
      main: ['Fill in the details', () => next()],
      alt: ['Try another file instead', () => void clearThen(onReset)],
    },
  };
  const action = ending && ending !== 'findings' ? actions[ending] : null;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.work}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            height: stage.interpolate({ inputRange: [0, 1, 2], outputRange: [190, 130, 200] }),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {celebrating ? (
            <CelebrationBadge size={88} />
          ) : (
            <Animated.View
              style={{
                transform: [
                  {
                    scale: stage.interpolate({
                      inputRange: [0, 1, 2],
                      outputRange: [1, 0.66, 0.66],
                    }),
                  },
                ],
              }}
            >
              {ending ? (
                <Beckon active>
                  <View style={styles.quiet}>
                    <Icon name="deed" size={64} color="#FFFFFF" strokeWidth={1.6} />
                  </View>
                </Beckon>
              ) : (
                <DeedArt />
              )}
            </Animated.View>
          )}
        </Animated.View>
        <FadeSwap id={title}>
          <Text style={styles.title}>{title}</Text>
        </FadeSwap>
        {/* Upload progress ticks without re-fading on every percent. */}
        <FadeSwap id={phase.kind === 'uploading' ? 'uploading' : text}>
          <Text style={styles.text}>{text}</Text>
        </FadeSwap>
        {phase.kind === 'uploading' ? (
          <View style={styles.progress}>
            <ProgressBar progress={phase.progress} />
          </View>
        ) : null}
        {phase.kind === 'reading' && (!ending || ending === 'findings') ? (
          <View style={styles.feed}>
            <PittuFeed feed={feed} tone="light" />
          </View>
        ) : null}

        {/* No findings to show: Pittu's answer, big, where the findings would be. */}
        {ending === 'duplicate' && duplicate ? (
          <Outcome
            icon="deed"
            title="Already in your locker"
            name={duplicate.name}
            text="This is the same sale deed, so there’s nothing new to add — and Pittu didn’t spend anything reading it again."
          />
        ) : ending === 'nothing' ? (
          <Outcome
            icon="search"
            title="No property details found"
            text="Pittu read the whole file but couldn’t find a property in it. It may not be a sale deed, or the pages may be hard to read. Try the deed’s PDF, or enter the details yourself."
          />
        ) : ending === 'not_deed' ? (
          <Outcome
            icon="info"
            title="Not a sale deed"
            text="This file doesn’t look like a sale deed. Try the deed itself, or enter the details yourself — you can add the deed later."
          />
        ) : ending === 'later' ? (
          <Outcome
            icon="clock"
            title="Back soon"
            text={`${ANALYSIS_ERROR_LABELS[a?.error_code ?? 'unavailable'] ?? ''} Your deed waits on Home, and Pittu picks it up from there.`}
          />
        ) : ending === 'unreadable' ? (
          <Outcome
            icon="warning"
            title="Couldn’t read this deed"
            text={`${ANALYSIS_ERROR_LABELS[a?.error_code ?? 'failed'] ?? ANALYSIS_ERROR_LABELS.failed!} The deed stays with the property.`}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, space.lg) }]}>
        {action ? (
          <>
            <Beckon active={!removeDraft.isPending}>
              <Button
                title={action.main[0]}
                variant="secondary"
                onPress={action.main[1]}
                loading={removeDraft.isPending}
              />
            </Beckon>
            <Pressable
              onPress={action.alt[1]}
              disabled={removeDraft.isPending}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.alt, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.altText}>{action.alt[0]}</Text>
            </Pressable>
          </>
        ) : (
          <Beckon active={feed.finished}>
            <Button
              title={feed.done ? 'Check and save' : 'Pittu is reading…'}
              variant="secondary"
              onPress={() => next()}
              disabled={!feed.done}
            />
          </Beckon>
        )}
      </View>
    </View>
  );
}

/** Pittu's answer when there are no findings to show: big, in the middle, where they'd be. */
function Outcome({
  icon,
  title,
  name,
  text,
}: {
  icon: IconName;
  title: string;
  name?: string;
  text: string;
}) {
  const [show] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(show, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, [show]);
  return (
    <Animated.View
      style={[
        styles.outcome,
        {
          opacity: show,
          transform: [{ scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
        },
      ]}
    >
      <View style={styles.outcomeIcon}>
        <Icon name={icon} size={30} color="#FFFFFF" strokeWidth={2} />
      </View>
      <Text style={styles.outcomeTitle}>{title}</Text>
      {name ? <Text style={styles.outcomeName}>{name}</Text> : null}
      <Text style={styles.outcomeText}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: {
    fontSize: font(28),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  text: {
    fontSize: font(15.5),
    lineHeight: font(22),
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: space.sm,
  },
  progress: { gap: space.xs, alignSelf: 'stretch' },
  work: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  feed: { alignSelf: 'stretch', marginTop: space.lg },
  bar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  alt: { alignItems: 'center', paddingVertical: space.sm },
  quiet: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  altText: { fontSize: font(14.5), fontWeight: '700', color: '#FFFFFF' },
  outcome: { alignSelf: 'stretch', alignItems: 'center', gap: space.sm, marginTop: space.xl },
  outcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  outcomeTitle: { fontSize: font(15), fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  outcomeName: {
    fontSize: font(26),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  outcomeText: {
    fontSize: font(15),
    lineHeight: font(21),
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
});
