import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatFileSize, type SupportAttachment, type SupportMessage } from '@propittu/shared';
import type { LocalFile } from '@/api/uploads';
import { signedImage } from '@/lib/image';
import { colors, radius, space, typography } from '@/theme';
import { AttachmentPreviews, useAttachmentAdder } from './AttachmentPicker';
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

/**
 * A conversation screen (support tickets, for customers and staff): an
 * optional header, the bubbles (scrolling, newest at the bottom), and a
 * reply bar docked at the bottom — a one-line note (e.g. when we reply)
 * above a text box with the paperclip on the right, then send.
 * `mine` = whose bubbles go on the right.
 */
export function ChatThread({
  header,
  refreshControl,
  messages,
  mine,
  onSend,
  sending,
  closedNote,
  notice,
}: {
  header?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  messages: SupportMessage[];
  mine: 'customer' | 'staff';
  onSend: (body: string, files: LocalFile[]) => Promise<boolean>;
  sending: boolean;
  closedNote?: string | null;
  notice?: { tone: 'info' | 'warning'; text: string } | null;
}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const attach = useAttachmentAdder({ files, onChange: setFiles, disabled: sending });

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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // Below the navigation header (44 pt + status bar) on iPhone.
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {header}
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
        {closedNote ? <Text style={[typography.small, styles.closed]}>{closedNote}</Text> : null}
      </ScrollView>

      {closedNote ? null : (
        <View style={styles.bar}>
          {notice ? (
            <View style={styles.notice}>
              <Icon
                name="clock"
                size={13}
                color={notice.tone === 'warning' ? colors.warning : colors.textSubtle}
              />
              <Text
                style={[typography.caption, notice.tone === 'warning' && { color: colors.warning }]}
              >
                {notice.text}
              </Text>
            </View>
          ) : null}
          <AttachmentPreviews files={files} onChange={setFiles} disabled={sending} />
          <View style={styles.reply}>
            <View style={styles.box}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={sending ? 'Sending…' : 'Write a reply…'}
                placeholderTextColor={colors.textSubtle}
                multiline
                maxLength={4000}
                editable={!sending}
                style={styles.input}
              />
              {attach.room > 0 ? (
                <IconButton
                  icon="attach"
                  label="Attach photos or files"
                  variant="plain"
                  size={36}
                  onPress={() => void attach.add()}
                />
              ) : null}
            </View>
            <IconButton
              icon="arrow"
              label="Send reply"
              variant="solid"
              size={40}
              onPress={() => void send()}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  messages: { padding: space.lg, paddingTop: space.md, gap: space.sm },
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
  bar: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reply: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: space.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: colors.text,
  },
  closed: { textAlign: 'center', marginTop: space.sm },
});
