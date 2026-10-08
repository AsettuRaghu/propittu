import { StyleSheet, Text, View } from 'react-native';
import { pittuQuestions, type PittuQuestionId } from '@propittu/shared';
import { useAnswerPittu, usePittu } from '@/api/ai';
import { font, radius } from '@/theme';
import { FadeSwap } from './Celebration';
import { Icon } from './Icon';
import { QuestionCard } from './QuestionCard';

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
      <QuestionCard
        key={next.id}
        question={next}
        eyebrow="While I read — a quick one"
        note={lastReply}
        busy={answer.isPending}
        layout="chips"
        tone="light"
        onAnswer={(value) => answer.mutate({ question: next.id, answer: value })}
        onSkip={() => answer.mutate({ question: next.id, answer: 'skipped' })}
        skipLabel="Skip"
      />
    </FadeSwap>
  );
}

const styles = StyleSheet.create({
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
