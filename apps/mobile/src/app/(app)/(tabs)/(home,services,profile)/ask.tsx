import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AskMessage } from '@propittu/shared';
import { useAsk, useAskThread } from '@/api/ai';
import { useProperty, useServices } from '@/api/queries';
import { Icon } from '@/components/Icon';
import { PropertyContext } from '@/components/PropertyContext';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { colors, font, radius, space, typography } from '@/theme';

const STARTERS_PROPERTY = [
  'Is this year’s property tax paid?',
  'Is the Khata in my name?',
  'What is my property worth now?',
  'What would I need to sell it?',
];
const STARTERS_ALL = [
  'What needs my attention this month?',
  'Which documents am I missing?',
  'How do I get an e-Khata in Bengaluru?',
];

/**
 * Ask Pittu: questions about the owner's property, answered from their own
 * property file. Each answer can suggest a next question, a service, or —
 * when Pittu can't answer — a handover to our team with the question filled in.
 */
export default function AskScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const id = propertyId ?? null;
  const thread = useAskThread(id);
  const ask = useAsk(id);
  const property = useProperty(id ?? '').data;
  const services = useServices();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const list = useRef<FlatList<AskMessage>>(null);

  const send = (q: string) => {
    const question = q.trim();
    if (question.length < 2 || ask.isPending) return;
    setText('');
    setPending(question);
    ask.mutate(question, { onSettled: () => setPending(null) });
  };
  const toTeam = (question: string) =>
    router.push({
      pathname: '/support/new',
      params: {
        subject: 'A question Pittu couldn’t answer',
        description: question,
        ...(id ? { propertyId: id } : {}),
      },
    });
  const book = (code: string) => {
    const s = (services.data ?? []).find((x) => x.code === code);
    router.push({
      pathname: '/services/request',
      params: { ...(id ? { propertyId: id } : {}), ...(s ? { serviceId: s.id } : {}) },
    });
  };

  if (thread.isPending) return <LoadingState />;
  if (thread.error)
    return <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />;
  const messages = thread.data;
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'owner')?.text ?? '';
  const starters = id ? STARTERS_PROPERTY : STARTERS_ALL;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          <View style={styles.head}>
            {id ? <PropertyContext propertyId={id} /> : null}
            {messages.length === 0 ? (
              <>
                <Pittu
                  text={
                    id && property
                      ? `Ask me anything about ${property.name} — tax, Khata, documents, its value, what to do next. I answer from your property file.`
                      : 'Ask me anything about your properties. I answer from what’s in your locker.'
                  }
                />
                <View style={styles.chips}>
                  {starters.map((s) => (
                    <Chip key={s} text={s} onPress={() => send(s)} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item: m, index }) =>
          m.role === 'owner' ? (
            <View style={styles.ownerRow}>
              <Text style={[typography.body, styles.owner]}>{m.text}</Text>
            </View>
          ) : (
            <View style={styles.gap}>
              <Pittu text={m.text} general={m.meta.sources?.includes('general_guidance')} />
              <View style={styles.chips}>
                {m.meta.service_code
                  ? (() => {
                      const s = (services.data ?? []).find((x) => x.code === m.meta.service_code);
                      return s ? (
                        <Chip
                          text={`Book: ${s.name}`}
                          icon="services"
                          onPress={() => book(s.code)}
                        />
                      ) : null;
                    })()
                  : null}
                {m.meta.needs_team ? (
                  <Chip
                    text="Ask our team"
                    icon="support"
                    onPress={() => toTeam(messages[index - 1]?.text ?? lastQuestion)}
                  />
                ) : null}
                {index === messages.length - 1
                  ? (m.meta.follow_ups ?? []).map((f) => (
                      <Chip key={f} text={f} onPress={() => send(f)} />
                    ))
                  : null}
              </View>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.gap}>
            {pending ? (
              <>
                <View style={styles.ownerRow}>
                  <Text style={[typography.body, styles.owner]}>{pending}</Text>
                </View>
                <View style={styles.thinking}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={typography.small}>Pittu is looking through your file…</Text>
                </View>
              </>
            ) : null}
            {ask.error ? <Banner message={errorMessage(ask.error)} /> : null}
          </View>
        }
      />
      <View style={styles.bar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask Pittu…"
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={1000}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => send(text)}
          disabled={text.trim().length < 2 || ask.isPending}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={({ pressed }) => [
            styles.send,
            (text.trim().length < 2 || ask.isPending) && styles.sendOff,
            pressed && styles.pressed,
          ]}
        >
          <Icon name="arrow" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Pittu({ text, general }: { text: string; general?: boolean }) {
  return (
    <View style={styles.pittuRow}>
      <View style={styles.avatar}>
        <Icon name="sparkles" size={14} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={styles.pittu}>
        <Text style={typography.body}>{text}</Text>
        {general ? (
          <Text style={typography.caption}>General guidance — not from your documents.</Text>
        ) : null}
      </View>
    </View>
  );
}

function Chip({
  text,
  icon,
  onPress,
}: {
  text: string;
  icon?: 'services' | 'support';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={13} color={colors.primary} /> : null}
      <Text style={styles.chipText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, paddingTop: space.xs, gap: space.md, paddingBottom: space.lg },
  head: { gap: space.md },
  gap: { gap: space.sm },
  ownerRow: { alignItems: 'flex-end' },
  owner: {
    maxWidth: '85%',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pittuRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pittu: {
    flex: 1,
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingLeft: 34 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: font(13), color: colors.primary, fontWeight: '600' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 34 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    fontSize: font(15),
    color: colors.text,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
