import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PROPERTY_TYPE_LABELS,
  type AreaUnit,
  type PropertyFact,
  type PropertyPrefill,
  type PropertyType,
} from '@propittu/shared';
import { formatArea, formatDate } from '@/lib/format';
import { accents, colors, font, radius, space, typography } from '@/theme';
import { Footer } from './Footer';
import { Icon } from './Icon';
import { Button } from './ui';

/** What Pittu says while reading, paced to a typical deed (~15–30 s). */
const SCRIPT: { at: number; text: string }[] = [
  { at: 0, text: 'Opened your deed — it’s stored privately' },
  { at: 3, text: 'Looking for the property schedule…' },
  { at: 7, text: 'Reading the measurements and boundaries…' },
  { at: 12, text: 'Picking out survey and Khata numbers…' },
  { at: 18, text: 'Noting who bought it, and when it was registered…' },
  { at: 25, text: 'Almost there — double-checking names and numbers…' },
  { at: 45, text: 'Long deeds take a little longer. Hang on…' },
];

type LineKind = 'done' | 'current' | 'found' | 'missing';

/** Pittu reading the deed: a scanning page and a running commentary. */
export function DeedReading({ elapsed }: { elapsed: number }) {
  const lines = SCRIPT.filter((s) => s.at <= elapsed);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScanningDeed />
      <View style={styles.head}>
        <Text style={[typography.title, styles.center]}>Pittu is reading your deed</Text>
        <Text style={[typography.small, styles.center]}>
          Usually under a minute. You can leave — it’ll be waiting on Home.
        </Text>
      </View>
      <View style={styles.feed}>
        {lines.map((l, i) => (
          <FeedLine key={l.at} kind={i === lines.length - 1 ? 'current' : 'done'} text={l.text} />
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Done reading: what Pittu found, revealed line by line — and what it
 * couldn't find, so the customer knows what to fill in next.
 */
export function DeedFindings({
  prefill,
  facts,
  onContinue,
}: {
  prefill: PropertyPrefill;
  facts: PropertyFact[];
  onContinue: () => void;
}) {
  const [lines] = useState(() => findings(prefill, facts));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : 450);
    return () => clearTimeout(t);
  }, [shown, lines.length]);
  const found = lines.filter((l) => l.kind === 'found').length;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.page, styles.pageDone]}>
          <Icon name="check" size={40} color={accents.teal.fg} strokeWidth={2.6} />
        </View>
        <View style={styles.head}>
          <Text style={[typography.title, styles.center]}>
            {found > 0 ? `Done — I found ${found} details` : 'Done reading'}
          </Text>
          <Text style={[typography.small, styles.center]}>
            Next, check them and fill in anything I missed.
          </Text>
        </View>
        <View style={styles.feed}>
          {lines.slice(0, shown).map((l) => (
            <FeedLine key={l.text} kind={l.kind} text={l.text} />
          ))}
        </View>
      </ScrollView>
      <Footer>
        <Button title="Check and save" onPress={onContinue} />
      </Footer>
    </View>
  );
}

function findings(
  p: PropertyPrefill,
  facts: PropertyFact[],
): { kind: 'found' | 'missing'; text: string }[] {
  const fact = (k: string) => facts.find((f) => f.key === k)?.value;
  const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v ? String(v) : null);
  const out: { kind: 'found' | 'missing'; text: string }[] = [];
  const add = (value: string | null, found: string, missing?: string) => {
    if (value) out.push({ kind: 'found', text: `${found} — ${value}` });
    else if (missing) out.push({ kind: 'missing', text: missing });
  };

  const type = p.property_type as PropertyType | null | undefined;
  add(type ? PROPERTY_TYPE_LABELS[type] : null, 'It’s a', 'Couldn’t tell the property type');
  add(
    [p.address_line, p.city].filter(Boolean).join(', ') || null,
    'Found the address',
    'Couldn’t find a full address',
  );
  add(
    p.area_value ? formatArea(Number(p.area_value), (p.area_unit as AreaUnit) ?? null) : null,
    'Found the area',
    'Couldn’t find the area',
  );
  add(str(p.survey_number), 'Found the survey number');
  add(str(p.khata_number), 'Found the Khata number');
  add(str(fact('registration_number')), 'Found the registration');
  const date = str(fact('registration_date'));
  add(date ? formatDate(date) : null, 'Registered on');
  add(str(fact('buyers')), 'Bought by');
  add(str(p.name), 'Suggested a name');
  if (!p.pincode) out.push({ kind: 'missing', text: 'No PIN code in the deed — add it next' });
  return out;
}

/** One line of commentary; it fades in where it lands (no sliding). */
function FeedLine({ kind, text }: { kind: LineKind; text: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [opacity]);
  return (
    <Animated.View style={[styles.line, { opacity }]}>
      <View style={styles.lineIcon}>
        {kind === 'current' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : kind === 'missing' ? (
          <Icon name="warning" size={16} color={colors.warning} />
        ) : (
          <Icon name="check" size={16} color={accents.teal.fg} strokeWidth={3} />
        )}
      </View>
      <Text
        style={[
          styles.lineText,
          kind === 'current' && styles.current,
          kind === 'missing' && styles.missing,
        ]}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

/** A page with a light sweeping across it, so the reading feels alive. */
function ScanningDeed() {
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);
  return (
    <View style={styles.page}>
      <Icon name="deed" size={44} color={colors.primary} strokeWidth={1.6} />
      <Animated.View
        style={[
          styles.beam,
          {
            transform: [
              { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [6, 86] }) },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  content: { padding: space.xl, paddingTop: 48, gap: space.xl, paddingBottom: space.xxl },
  head: { gap: space.xs },
  page: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pageDone: { backgroundColor: accents.teal.bg },
  beam: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    opacity: 0.55,
  },
  feed: { gap: space.md },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  lineIcon: { width: 20, height: 22, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, fontSize: font(15), lineHeight: font(22), color: colors.textMuted },
  current: { color: colors.text, fontWeight: '700' },
  missing: { color: colors.warning, fontWeight: '600' },
});
