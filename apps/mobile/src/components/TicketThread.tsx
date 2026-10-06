import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupportMessage } from '@propittu/shared';
import { colors, radius, space, typography } from '@/theme';
import { IconButton } from './ui';

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

/** A support conversation, plus a reply box. `mine` is whose bubbles go on the right. */
export function TicketThread({
  messages,
  mine,
  onSend,
  sending,
  closedNote,
}: {
  messages: SupportMessage[];
  mine: 'customer' | 'staff';
  onSend: (body: string) => void;
  sending: boolean;
  closedNote?: string | null;
}) {
  const [draft, setDraft] = useState('');

  return (
    <View style={styles.wrap}>
      {messages.map((m) => {
        const own = m.author_type === mine;
        return (
          <View key={m.id} style={[styles.bubbleRow, own && styles.bubbleRowOwn]}>
            <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
              {!own ? (
                <Text style={styles.author}>
                  {m.author_type === 'staff' ? 'Propittu team' : 'Customer'}
                </Text>
              ) : null}
              <Text style={[typography.body, own && { color: '#FFFFFF' }]}>{m.body}</Text>
              <Text style={[styles.time, own && { color: 'rgba(255,255,255,0.75)' }]}>
                {stamp(m.created_at)}
              </Text>
            </View>
          </View>
        );
      })}

      {closedNote ? (
        <Text style={[typography.small, styles.closed]}>{closedNote}</Text>
      ) : (
        <View style={styles.reply}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a reply…"
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <IconButton
            icon="arrow"
            label="Send reply"
            variant="solid"
            size={40}
            onPress={() => {
              if (!draft.trim() || sending) return;
              onSend(draft.trim());
              setDraft('');
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: 3,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  author: { fontSize: 12, fontWeight: '800', color: colors.primary },
  time: { fontSize: 11, color: colors.textSubtle, alignSelf: 'flex-end' },
  reply: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: colors.text,
  },
  closed: { textAlign: 'center', marginTop: space.sm },
});
