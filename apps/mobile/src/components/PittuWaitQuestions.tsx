import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pittuQuestions, type PittuQuestionId } from '@propittu/shared';
import { useAnswerPittu, usePittu } from '@/api/ai';
import { font, radius, space } from '@/theme';
import { FadeSwap } from './Celebration';
import { Icon } from './Icon';

/**
 * Questions that don't need the deed, asked while Pittu reads it — the
 * waiting minute put to use. Answers are saved against the property, so
 * the questions after saving skip them. The rest (who owns it, Khata,
 * plot or house) depend on the deed and come after.
 */
const WHILE_READING: PittuQuestionId[] = ['last_visit', 'tax_paid'];

export function PittuWaitQuestions({ propertyId }: { propertyId: string }) {
  const pittu = usePittu(propertyId);
  const answer = useAnswerPittu(propertyId);
  const state = pittu.data;
  if (!state) return null;

  const questions = pittuQuestions(state.context, state.answers).filter((q) =>
    WHILE_READING.includes(q.id),
  );
  const next = questions.find((q) => !state.answers[q.id]);
  const lastAnswered = [...questions].reverse().find((q) => state.answers[q.id]);
  const lastReply = lastAnswered?.options.find(
    (o) => o.value === state.answers[lastAnswered.id],
  )?.reply;

  if (!next) {
    return lastReply ? (
      <FadeSwap id="done">
        <View style={styles.thanks}>
          <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
          <Text style={styles.thanksText}>{lastReply}</Text>
        </View>
      </FadeSwap>
    ) : null;
  }

  return (
    <FadeSwap id={next.id}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>While I read — a quick one</Text>
        <Text style={styles.title}>{next.title}</Text>
        {lastReply ? <Text style={styles.reply}>{lastReply}</Text> : null}
        <View style={styles.options}>
          {next.options.map((o) => (
            <Pressable
              key={o.value}
              disabled={answer.isPending}
              onPress={() => answer.mutate({ question: next.id, answer: o.value })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <Text style={styles.optionText}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => answer.mutate({ question: next.id, answer: 'skipped' })}
          disabled={answer.isPending}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>
    </FadeSwap>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  eyebrow: { fontSize: font(12.5), fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  title: { fontSize: font(17), fontWeight: '800', color: '#FFFFFF' },
  reply: { fontSize: font(13), color: 'rgba(255,255,255,0.8)' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.75 },
  optionText: { fontSize: font(14), fontWeight: '700', color: '#4338CA' },
  skip: { fontSize: font(13), fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  thanksText: { fontSize: font(13), fontWeight: '600', color: '#FFFFFF', flexShrink: 1 },
});
