import { LinearGradient } from 'expo-linear-gradient';
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
import { accents, colors, font, gradients, space, typography } from '@/theme';
import { CelebrationBadge } from './Celebration';
import { DeedArt } from './DeedArt';
import { Footer } from './Footer';
import { Icon, type IconName } from './Icon';
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

interface Finding {
  kind: 'found' | 'missing';
  icon: IconName;
  label: string;
  value?: string;
}

type Result = { prefill: PropertyPrefill; facts: PropertyFact[] } | null;

/**
 * Where Pittu is in reading a deed: the commentary said so far (paced by
 * `elapsed`), and once the reading arrives, the findings revealed one by
 * one — counting up. Shared by the Add property screen and the resumed page.
 */
export function usePittuFeed(elapsed: number, result: Result) {
  const done = result !== null;
  const [findings] = useFindings(result);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!done || shown >= findings.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : 340);
    return () => clearTimeout(t);
  }, [done, shown, findings.length]);
  return {
    done,
    said: SCRIPT.filter((s) => s.at <= elapsed),
    findings: findings.slice(0, shown),
    found: findings.slice(0, shown).filter((f) => f.kind === 'found').length,
    finished: done && shown >= findings.length,
    toFill: findings.filter((f) => f.kind === 'missing').length,
  };
}
export type PittuFeedState = ReturnType<typeof usePittuFeed>;

/** One line under the next: the commentary while reading, then what was found. */
export function PittuFeed({
  feed,
  tone = 'default',
}: {
  feed: PittuFeedState;
  tone?: 'default' | 'light';
}) {
  return (
    <View style={styles.feedLines}>
      {/* The commentary gives way to the findings once reading is done. */}
      {feed.done
        ? null
        : feed.said.map((l, i) => (
            <Line
              key={l.at}
              kind={i === feed.said.length - 1 ? 'current' : 'said'}
              icon="check"
              label={l.text}
              tone={tone}
            />
          ))}
      {feed.findings.map((f) => (
        <Line
          key={f.label}
          kind={f.kind}
          icon={f.icon}
          label={f.label}
          value={f.value}
          tone={tone}
        />
      ))}
    </View>
  );
}

/** The heading and the line under it, as the reading moves on. */
export function feedHeadline(feed: PittuFeedState): { title: string; text: string } {
  if (!feed.done) {
    return {
      title: 'Pittu is filling it in for you',
      text: 'Usually under a minute. You can leave — it’ll be waiting on Home.',
    };
  }
  if (!feed.finished) {
    return {
      title: `Found ${feed.found} detail${feed.found === 1 ? '' : 's'}…`,
      text: 'Here’s what I found',
    };
  }
  return {
    title: 'Pittu has done its magic ✨',
    text:
      feed.toFill > 0
        ? `${feed.found} details found · ${feed.toFill} for you to fill in`
        : `${feed.found} details found — check them, then save`,
  };
}

/**
 * The resumed reading page (opened from "Waiting for you" while Pittu is
 * still at it): the same feed as the Add property screen, then "Check and
 * save" opens the form.
 */
export function DeedReading({
  elapsed,
  result,
  onContinue,
}: {
  elapsed: number;
  /** Set once the reading is ready. */
  result: Result;
  onContinue: () => void;
}) {
  const feed = usePittuFeed(elapsed, result);
  const { title, text } = feedHeadline(feed);
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[gradients.brand[0], gradients.brand[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.top}
        >
          {feed.done ? <CelebrationBadge size={88} /> : <DeedArt />}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>
        </LinearGradient>
        <View style={styles.feed}>
          <PittuFeed feed={feed} />
        </View>
      </ScrollView>
      <Footer>
        <Button
          title={feed.done ? 'Check and save' : 'Pittu is reading…'}
          onPress={onContinue}
          disabled={!feed.done}
        />
      </Footer>
    </View>
  );
}

/** The findings, worked out once when the reading arrives. */
function useFindings(result: { prefill: PropertyPrefill; facts: PropertyFact[] } | null) {
  const [cache, setCache] = useState<{ for: unknown; list: Finding[] }>({ for: null, list: [] });
  if (result && cache.for !== result.facts) {
    setCache({ for: result.facts, list: findings(result.prefill, result.facts) });
  }
  return [cache.list] as const;
}

function findings(p: PropertyPrefill, facts: PropertyFact[]): Finding[] {
  const fact = (k: string) => facts.find((f) => f.key === k)?.value;
  const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v ? String(v) : null);
  const out: Finding[] = [];
  const add = (icon: IconName, label: string, value: string | null, missing?: string) => {
    if (value) out.push({ kind: 'found', icon, label, value });
    else if (missing) out.push({ kind: 'missing', icon: 'warning', label: missing });
  };

  const type = p.property_type as PropertyType | null | undefined;
  add(
    'home',
    'Property type',
    type ? (PROPERTY_TYPE_LABELS[type] ?? null) : null,
    'Couldn’t tell the property type',
  );
  add(
    'pin',
    'Address',
    [p.address_line, p.city].filter(Boolean).join(', ') || null,
    'Couldn’t find a full address',
  );
  add(
    'area',
    'Area',
    p.area_value ? formatArea(Number(p.area_value), (p.area_unit as AreaUnit) ?? null) : null,
    'Couldn’t find the area',
  );
  add('tag', 'Survey number', str(p.survey_number));
  add('tag', 'Khata number', str(p.khata_number));
  add('receipt', 'Registration', str(fact('registration_number')));
  const date = str(fact('registration_date'));
  add('calendar', 'Registered on', date ? formatDate(date) : null);
  add('users', 'Bought by', str(fact('buyers')));
  add('sparkles', 'A name for it', str(p.name));
  if (!p.pincode) out.push({ kind: 'missing', icon: 'warning', label: 'No PIN code in the deed' });
  // What needs the customer comes first, so it is never lost below the fold.
  return [...out.filter((f) => f.kind === 'missing'), ...out.filter((f) => f.kind === 'found')];
}

/** One line of the feed; it fades in where it lands (no sliding). */
function Line({
  kind,
  icon,
  label,
  value,
  tone,
}: {
  kind: 'said' | 'current' | 'found' | 'missing';
  icon: IconName;
  label: string;
  value?: string;
  tone: 'default' | 'light';
}) {
  const light = tone === 'light';
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(kind === 'found' ? 0.92 : 1));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  const found = kind === 'found';
  const missing = kind === 'missing';
  return (
    <Animated.View style={[styles.line, { opacity, transform: [{ scale }] }]}>
      <View
        style={[
          styles.lineIcon,
          found && (light ? styles.lightIcon : styles.foundIcon),
          missing && (light ? styles.lightMissingIcon : styles.missingIcon),
        ]}
      >
        {kind === 'current' ? (
          <ActivityIndicator size="small" color={light ? '#FFFFFF' : colors.primary} />
        ) : (
          <Icon
            name={icon}
            size={found ? 16 : 14}
            color={
              light
                ? missing
                  ? '#FFD38A'
                  : '#FFFFFF'
                : found
                  ? accents.teal.fg
                  : missing
                    ? colors.warning
                    : colors.textSubtle
            }
            strokeWidth={2.4}
          />
        )}
      </View>
      <View style={styles.flex}>
        {found ? (
          <>
            <Text style={[typography.caption, light && styles.lightCaption]}>{label}</Text>
            <Text style={[styles.value, light && styles.lightValue]}>{value}</Text>
          </>
        ) : (
          <Text
            style={[
              styles.said,
              light && styles.lightSaid,
              kind === 'current' && (light ? styles.lightCurrent : styles.current),
              missing && (light ? styles.lightMissing : styles.missing),
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { flexGrow: 1, paddingBottom: space.xxl },
  top: {
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    gap: space.sm,
  },
  title: {
    fontSize: font(24),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  text: { fontSize: font(14.5), color: 'rgba(255,255,255,0.88)', textAlign: 'center' },
  feed: { padding: space.lg, paddingTop: space.xl },
  feedLines: { gap: space.md },
  lightIcon: { backgroundColor: 'rgba(255,255,255,0.2)' },
  lightMissingIcon: { backgroundColor: 'rgba(255,211,138,0.22)' },
  lightCaption: { color: 'rgba(255,255,255,0.75)' },
  lightValue: { color: '#FFFFFF' },
  lightSaid: { color: 'rgba(255,255,255,0.75)' },
  lightCurrent: { color: '#FFFFFF', fontWeight: '700' },
  lightMissing: { color: '#FFD38A', fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundIcon: { backgroundColor: accents.teal.bg },
  missingIcon: { backgroundColor: accents.amber.bg },
  said: { fontSize: font(14.5), lineHeight: font(20), color: colors.textMuted },
  current: { color: colors.text, fontWeight: '700' },
  missing: { color: colors.warning, fontWeight: '700' },
  value: { fontSize: font(16), fontWeight: '700', color: colors.text },
});
