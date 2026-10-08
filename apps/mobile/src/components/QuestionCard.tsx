import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, typography } from '@/theme';
import { Icon } from './Icon';

export interface QuestionCardQuestion {
  id: string;
  title: string;
  /** Why we ask, under the title. */
  why?: string;
  options: { value: string; label: string }[];
  /** "What's a Khata?" style explainer. */
  glossary?: { label: string; text: string };
}

/** How long the chosen answer shows before moving on (feels instant, reads clearly). */
const PICK_MS = 260;

/**
 * One question with tap answers — Pittu's quick questions, the questions
 * while Pittu reads, and anywhere else we ask. The tapped answer fills
 * with colour at once, a tick pops in and the others fade back; then
 * `onAnswer` runs, so the tap always feels immediate even while saving.
 * Key it by the question id so each question starts fresh.
 *
 *   layout "rows"   full-width answers (a page of questions)
 *   layout "chips"  answers that wrap (a small card, e.g. on a gradient)
 *   tone   "light"  for use on a coloured background
 */
export function QuestionCard({
  question: q,
  onAnswer,
  onSkip,
  skipLabel = 'Skip for now',
  eyebrow,
  note,
  busy = false,
  layout = 'rows',
  tone = 'default',
}: {
  question: QuestionCardQuestion;
  onAnswer: (value: string) => void;
  onSkip?: () => void;
  skipLabel?: string;
  eyebrow?: string;
  /** A line under the title (e.g. Pittu's reply to the last answer). */
  note?: string | null;
  busy?: boolean;
  layout?: 'rows' | 'chips';
  tone?: 'default' | 'light';
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [glossary, setGlossary] = useState(false);
  const [fill] = useState(() => new Animated.Value(0));
  const light = tone === 'light';

  useEffect(() => {
    if (picked === null) return;
    const anim = Animated.timing(fill, {
      toValue: 1,
      duration: PICK_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && onAnswer(picked));
    return () => anim.stop();
    // onAnswer runs once per pick; the card is keyed by question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, fill]);

  const choose = (value: string) => {
    if (busy || picked !== null) return;
    setPicked(value);
  };

  return (
    <View style={[styles.card, light ? styles.cardLight : styles.cardDefault]}>
      {eyebrow ? <Text style={[styles.eyebrow, light && styles.lightMuted]}>{eyebrow}</Text> : null}
      <Text style={[styles.title, light && styles.lightText]}>{q.title}</Text>
      {q.why ? <Text style={[typography.small, light && styles.lightMuted]}>{q.why}</Text> : null}
      {note ? <Text style={[styles.note, light && styles.lightMuted]}>{note}</Text> : null}
      {q.glossary ? (
        <>
          <Pressable onPress={() => setGlossary((g) => !g)} style={styles.gloss} hitSlop={6}>
            <Text style={[styles.glossText, light && styles.lightText]}>
              {glossary ? 'Hide' : q.glossary.label}
            </Text>
          </Pressable>
          {glossary ? (
            <Text style={[typography.small, light && styles.lightMuted]}>{q.glossary.text}</Text>
          ) : null}
        </>
      ) : null}

      <View style={layout === 'chips' ? styles.chips : styles.rows}>
        {q.options.map((o) => {
          const isPicked = picked === o.value;
          const others = picked !== null && !isPicked;
          const base = light ? '#FFFFFF' : colors.surface;
          const on = light ? colors.primarySoft : colors.primary;
          return (
            <Pressable
              key={o.value}
              onPress={() => choose(o.value)}
              disabled={busy || picked !== null}
              accessibilityRole="button"
              accessibilityState={{ selected: isPicked }}
            >
              <Animated.View
                style={[
                  layout === 'chips' ? styles.chip : styles.row,
                  !light && layout === 'rows' && styles.rowBorder,
                  {
                    backgroundColor: isPicked
                      ? fill.interpolate({ inputRange: [0, 1], outputRange: [base, on] })
                      : base,
                    opacity: others ? 0.45 : 1,
                    transform: isPicked
                      ? [
                          {
                            scale: fill.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [1, 1.04, 1],
                            }),
                          },
                        ]
                      : [],
                  },
                ]}
              >
                <Text
                  style={[
                    layout === 'chips' ? styles.chipText : typography.bodyStrong,
                    isPicked && !light && styles.pickedText,
                  ]}
                >
                  {o.label}
                </Text>
                {isPicked ? (
                  <Animated.View style={{ opacity: fill }}>
                    <Icon
                      name="check"
                      size={16}
                      color={light ? colors.primary : '#FFFFFF'}
                      strokeWidth={3}
                    />
                  </Animated.View>
                ) : layout === 'rows' ? (
                  <Icon name="chevron" size={16} color={colors.textSubtle} />
                ) : null}
              </Animated.View>
            </Pressable>
          );
        })}
      </View>

      {onSkip ? (
        <Pressable
          onPress={onSkip}
          disabled={busy || picked !== null}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={[styles.skip, light && styles.lightMuted]}>{skipLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, alignSelf: 'stretch' },
  cardDefault: {},
  cardLight: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    padding: space.md,
  },
  eyebrow: { fontSize: font(12.5), fontWeight: '700', color: colors.textMuted },
  title: { fontSize: font(19), fontWeight: '800', color: colors.text, lineHeight: font(25) },
  note: { fontSize: font(13.5), color: colors.textMuted },
  lightText: { color: '#FFFFFF' },
  lightMuted: { color: 'rgba(255,255,255,0.82)' },
  gloss: { alignSelf: 'flex-start' },
  glossText: { fontSize: font(13.5), fontWeight: '700', color: colors.primary },
  rows: { gap: space.sm, marginTop: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: 15,
  },
  rowBorder: { borderWidth: 1.5, borderColor: colors.border },
  pickedText: { color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  chipText: { fontSize: font(14), fontWeight: '700', color: colors.primary },
  skip: {
    fontSize: font(13.5),
    fontWeight: '700',
    color: colors.textMuted,
    paddingVertical: space.xs,
  },
});
