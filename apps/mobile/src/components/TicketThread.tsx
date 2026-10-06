import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatFileSize, type SupportAttachment, type SupportMessage } from '@propittu/shared';
import type { LocalFile } from '@/api/uploads';
import { signedImage } from '@/lib/image';
import { colors, radius, space, typography } from '@/theme';
import { AttachmentPicker } from './AttachmentPicker';
import { Icon } from './Icon';
import { IconButton } from './ui';

function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

const open = (a: SupportAttachment) => {
  if (a.url) void WebBrowser.openBrowserAsync(a.url);
};

function Attachments({ items, own }: { items: SupportAttachment[]; own: boolean }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.atts}>
      {items.map((a) =>
        a.mime_type.startsWith('image/') && a.url ? (
          <Pressable
            key={a.id}
            onPress={() => open(a)}
            accessibilityRole="imagebutton"
            accessibilityLabel={a.file_name}
          >
            <Image source={signedImage(a.url)} style={styles.attImage} contentFit="cover" />
          </Pressable>
        ) : (
          <Pressable
            key={a.id}
            onPress={() => open(a)}
            accessibilityRole="button"
            style={[styles.attFile, own && styles.attFileOwn]}
          >
            <Icon name="document" size={16} color={own ? '#FFFFFF' : colors.primary} />
            <View style={styles.flex}>
              <Text style={[styles.attName, own && { color: '#FFFFFF' }]} numberOfLines={1}>
                {a.file_name}
              </Text>
              <Text style={[styles.attSize, own && { color: 'rgba(255,255,255,0.75)' }]}>
                {formatFileSize(a.file_size)}
              </Text>
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** A support conversation with attachments, plus a reply box. `mine` = whose bubbles go right. */
export function TicketThread({
  messages,
  mine,
  onSend,
  sending,
  closedNote,
}: {
  messages: SupportMessage[];
  mine: 'customer' | 'staff';
  onSend: (body: string, files: LocalFile[]) => Promise<boolean>;
  sending: boolean;
  closedNote?: string | null;
}) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<LocalFile[]>([]);

  const send = async () => {
    if (sending || (!draft.trim() && files.length === 0)) return;
    const body =
      draft.trim() || (files.length === 1 ? 'Attached a file' : `Attached ${files.length} files`);
    const ok = await onSend(body, files);
    if (ok) {
      setDraft('');
      setFiles([]);
    }
  };

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
              <Attachments items={m.attachments ?? []} own={own} />
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
        <View style={styles.composer}>
          <View style={styles.reply}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a reply…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={4000}
              editable={!sending}
              style={styles.input}
            />
            <IconButton
              icon="arrow"
              label="Send reply"
              variant="solid"
              size={40}
              onPress={() => void send()}
            />
          </View>
          <AttachmentPicker files={files} onChange={setFiles} disabled={sending} />
          {sending ? <Text style={typography.caption}>Sending…</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: space.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  author: { fontSize: 12, fontWeight: '800', color: colors.primary },
  time: { fontSize: 11, color: colors.textSubtle, alignSelf: 'flex-end' },
  atts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  attImage: { width: 96, height: 96, borderRadius: radius.sm },
  attFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 180,
  },
  attFileOwn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  attName: { fontSize: 13, fontWeight: '700', color: colors.text },
  attSize: { fontSize: 11, color: colors.textSubtle },
  composer: { gap: space.sm, marginTop: space.sm },
  reply: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
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
