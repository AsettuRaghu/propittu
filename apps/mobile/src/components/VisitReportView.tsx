import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { VISIT_CONDITION_LABELS, type VisitMedia, type VisitReport } from '@propittu/shared';
import { playVideo } from '@/api/uploads';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { signedImage } from '@/lib/image';
import { colors, radius, space, typography } from '@/theme';
import { Badge, Card, type Tone } from './ui';

const CONDITION_TONES: Record<VisitReport['condition'], Tone> = {
  good: 'success',
  fair: 'warning',
  needs_attention: 'danger',
};

/** Property Visit report (M4): what the customer sees, and staff preview. */
export function VisitReportView({
  report,
  onMediaPress,
}: {
  report: VisitReport;
  /** Staff override (e.g. delete); customers just open the media. */
  onMediaPress?: (media: VisitMedia) => void;
}) {
  const open = (m: VisitMedia) => {
    if (onMediaPress) return onMediaPress(m);
    if (!m.url) return;
    const action =
      m.kind === 'video' ? playVideo({ url: m.url }) : WebBrowser.openBrowserAsync(m.url);
    void Promise.resolve(action).catch((err) =>
      Alert.alert("Couldn't open this file", errorMessage(err)),
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={typography.heading}>Visit report</Text>
        <Badge
          label={VISIT_CONDITION_LABELS[report.condition]}
          tone={CONDITION_TONES[report.condition]}
        />
      </View>
      <Text style={typography.small}>Visited on {formatDate(report.visited_at)}</Text>

      <Section title="Observations" text={report.observations} />
      <Section title="Issues found" text={report.issues} />
      <Section title="Recommendations" text={report.recommendations} />

      {report.media.length > 0 ? (
        <View style={styles.grid}>
          {report.media.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => open(m)}
              style={styles.tile}
              accessibilityRole="button"
              accessibilityLabel={m.kind === 'video' ? 'Visit video' : 'Visit photo'}
            >
              {m.kind === 'photo' && m.url ? (
                <Image source={signedImage(m.url)} style={styles.image} contentFit="cover" />
              ) : (
                <View style={[styles.image, styles.video]}>
                  <Ionicons name="play-circle" size={32} color={colors.onPrimary} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={typography.overline}>{title}</Text>
      <Text style={typography.body}>{text}</Text>
    </View>
  );
}

const TILE = 96;

const styles = StyleSheet.create({
  card: { gap: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: TILE, height: TILE, borderRadius: radius.md, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  video: { backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
