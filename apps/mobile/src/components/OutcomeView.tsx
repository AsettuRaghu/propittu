import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
  type OutcomeFile,
  type ServiceOutcome,
} from '@propittu/shared';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { accents, colors, radius, space, typography } from '@/theme';
import { dialog } from './Dialog';
import { Icon } from './Icon';
import { Card, IconTile } from './ui';

/**
 * Paperwork help result (outcome summary): what was done, what we found,
 * reference number, when it is next due, and the result files. What the
 * customer sees once completed, and the staff preview of the draft.
 */
export function OutcomeView({
  outcome,
  onFilePress,
  draft = false,
}: {
  outcome: ServiceOutcome;
  /** Staff override (e.g. remove); customers just open the file. */
  onFilePress?: (file: OutcomeFile) => void;
  draft?: boolean;
}) {
  const open = (f: OutcomeFile) => {
    if (onFilePress) return onFilePress(f);
    if (!f.url) return;
    void WebBrowser.openBrowserAsync(f.url).catch((err) =>
      dialog.alert({
        title: "Couldn't open this file",
        message: errorMessage(err),
        tone: 'danger',
      }),
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <IconTile icon="verified" accent="teal" size={36} />
        <Text style={[typography.heading, styles.flex]}>
          {draft ? 'Outcome (draft)' : 'Outcome'}
        </Text>
      </View>

      <Text style={typography.body}>{outcome.summary}</Text>
      {outcome.findings ? (
        <View style={styles.section}>
          <Text style={typography.overline}>What we found</Text>
          <Text style={typography.body}>{outcome.findings}</Text>
        </View>
      ) : null}

      {outcome.reference_number || outcome.next_due_date ? (
        <View style={styles.facts}>
          {outcome.reference_number ? (
            <Fact label="Reference" value={outcome.reference_number} />
          ) : null}
          {outcome.next_due_date ? (
            <Fact label="Next due" value={formatDate(outcome.next_due_date)} />
          ) : null}
        </View>
      ) : null}

      {outcome.files.length > 0 ? (
        <View style={styles.section}>
          <Text style={typography.overline}>Files</Text>
          {outcome.files.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => open(f)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.file, pressed && { opacity: 0.8 }]}
            >
              <Icon
                name={f.mime_type === 'application/pdf' ? 'document' : 'image'}
                size={18}
                color={colors.primary}
              />
              <View style={styles.flex}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {f.file_name}
                </Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {formatFileSize(f.file_size)}
                  {f.document_type
                    ? f.saved_to_documents
                      ? ` · Saved to Documents (${DOCUMENT_TYPE_LABELS[f.document_type]})`
                      : ` · Will be saved to Documents (${DOCUMENT_TYPE_LABELS[f.document_type]})`
                    : ''}
                </Text>
              </View>
              {f.saved_to_documents ? (
                <Icon name="check" size={16} color={accents.teal.fg} strokeWidth={3} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={typography.bodyStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  section: { gap: space.xs },
  facts: { flexDirection: 'row', gap: space.md },
  fact: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
});
