import { Image } from 'expo-image';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalFile } from '@/api/uploads';
import { photosToPdf } from '@/lib/deedPdf';
import { errorMessage } from '@/lib/errors';
import { fromCamera } from '@/lib/pickPhotos';
import { font, radius, space } from '@/theme';
import { Beckon } from './Celebration';
import { Icon, type IconName } from './Icon';
import { Banner, Button } from './ui';

/** Enough for the pages that matter; a whole long deed is better as a PDF. */
const MAX_PAGES = 10;

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'deed', text: 'The first page, the property schedule, and the last page with the stamp' },
  { icon: 'image', text: 'Flat on a table, in good light, the whole page in the frame' },
  { icon: 'search', text: 'Check each photo is sharp before sending' },
];

/**
 * Photographing the sale deed instead of uploading a PDF: take the pages
 * one by one (retake or remove any), then send them to Pittu. The phone
 * joins them into one PDF, which then goes the same way as an upload.
 */
export function DeedPhotos({
  onSend,
  onCancel,
  bottomInset,
}: {
  onSend: (file: LocalFile) => void;
  onCancel: () => void;
  bottomInset: number;
}) {
  const [pages, setPages] = useState<ImagePickerAsset[]>([]);
  const [building, setBuilding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const full = pages.length >= MAX_PAGES;

  const take = async (replace?: number) => {
    setProblem(null);
    const [shot] = await fromCamera('to photograph your sale deed');
    if (!shot) return;
    setPages((p) =>
      replace === undefined
        ? [...p, shot].slice(0, MAX_PAGES)
        : p.map((x, i) => (i === replace ? shot : x)),
    );
  };

  const send = async () => {
    setBuilding(true);
    setProblem(null);
    try {
      onSend(await photosToPdf(pages));
    } catch (err) {
      setProblem(errorMessage(err, 'Couldn’t prepare the photos. Please try again.'));
      setBuilding(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={styles.headIcon}>
            <Icon name="camera" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Photograph your deed</Text>
          <Text style={styles.text}>
            Take the important pages — Pittu reads them just the same.
          </Text>
        </View>

        {pages.length === 0 ? (
          <View style={styles.tips}>
            {TIPS.map((t) => (
              <View key={t.text} style={styles.tip}>
                <View style={styles.tipIcon}>
                  <Icon name={t.icon} size={16} color="#FFFFFF" />
                </View>
                <Text style={styles.tipText}>{t.text}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {pages.map((p, i) => (
              <View key={`${i}-${p.uri}`} style={styles.page}>
                <Pressable
                  onPress={() => void take(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retake page ${i + 1}`}
                  style={StyleSheet.absoluteFill}
                >
                  <Image
                    source={{ uri: p.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                </Pressable>
                <View style={styles.pageNo} pointerEvents="none">
                  <Text style={styles.pageNoText}>{i + 1}</Text>
                </View>
                <Pressable
                  onPress={() => setPages((all) => all.filter((_, j) => j !== i))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove page ${i + 1}`}
                  style={styles.remove}
                >
                  <Icon name="close" size={13} color="#FFFFFF" strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            {!full ? (
              <Pressable
                onPress={() => void take()}
                accessibilityRole="button"
                accessibilityLabel="Take the next page"
                style={({ pressed }) => [styles.page, styles.add, pressed && { opacity: 0.7 }]}
              >
                <Icon name="camera" size={22} color="#FFFFFF" />
                <Text style={styles.addText}>Page {pages.length + 1}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {pages.length > 0 ? (
          <Text style={styles.note}>Tap a page to retake it · up to {MAX_PAGES} pages</Text>
        ) : null}
        {problem ? <Banner message={problem} /> : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, space.lg) }]}>
        {pages.length === 0 ? (
          <Beckon active>
            <Button
              title="Take the first page"
              icon="camera"
              variant="secondary"
              onPress={() => void take()}
            />
          </Beckon>
        ) : (
          <Beckon active={!building}>
            <Button
              title={`Send ${pages.length} page${pages.length === 1 ? '' : 's'} to Pittu`}
              icon="sparkles"
              variant="secondary"
              onPress={() => void send()}
              loading={building}
            />
          </Beckon>
        )}
        <Pressable
          onPress={onCancel}
          disabled={building}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.alt, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.altText}>Upload a PDF instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const PAGE_W = 96;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.xl, paddingTop: space.md, gap: space.lg },
  head: { alignItems: 'center', gap: space.sm },
  headIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: font(26),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  text: { fontSize: font(15), color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  tips: { gap: space.md, marginTop: space.md },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, fontSize: font(14.5), lineHeight: font(20), color: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'center' },
  page: {
    width: PAGE_W,
    height: PAGE_W * 1.35,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pageNo: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNoText: { fontSize: font(12), fontWeight: '800', color: '#FFFFFF' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { fontSize: font(13), fontWeight: '700', color: '#FFFFFF' },
  note: { fontSize: font(12.5), color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  bar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  alt: { alignItems: 'center', paddingVertical: space.sm },
  altText: { fontSize: font(14.5), fontWeight: '700', color: '#FFFFFF' },
});
