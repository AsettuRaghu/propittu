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

/**
 * Pittu reading the deed, on one page from start to finish: the deed being
 * read and a running commentary; then, once done, what it found appears
 * line by line (and what it couldn't find), counting up, and "Check and
 * save" opens the form. Nothing moves between pages along the way.
 */
export function DeedReading({
  elapsed,
  result,
  onContinue,
}: {
  elapsed: number;
  /** Set once the reading is ready. */
  result: { prefill: PropertyPrefill; facts: PropertyFact[] } | null;
  onContinue: () => void;
}) {
  const done = result !== null;
  const [findings] = useFindings(result);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!done || shown >= findings.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : 480);
    return () => clearTimeout(t);
  }, [done, shown, findings.length]);

  const said = SCRIPT.filter((s) => s.at <= elapsed);
  const found = findings.slice(0, shown).filter((f) => f.kind === 'found').length;
  const finished = done && shown >= findings.length;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[gradients.brand[0], gradients.brand[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.top}
        >
          {done ? <DoneBadge /> : <DeedArt />}
          <Text style={styles.title}>
            {!done
              ? 'Pittu is reading your deed'
              : found === 0
                ? 'Done reading'
                : `${finished ? 'Done — I found' : 'Found'} ${found} detail${found === 1 ? '' : 's'}`}
          </Text>
          <Text style={styles.text}>
            {done
              ? 'Next, check them and fill in anything I missed.'
              : 'Usually under a minute. You can leave — it’ll be waiting on Home.'}
          </Text>
        </LinearGradient>

        <View style={styles.feed}>
          {said.map((l, i) => (
            <Line
              key={l.at}
              kind={i === said.length - 1 && !done ? 'current' : 'said'}
              icon="check"
              label={l.text}
            />
          ))}
          {findings.slice(0, shown).map((f) => (
            <Line key={f.label} kind={f.kind} icon={f.icon} label={f.label} value={f.value} />
          ))}
        </View>
      </ScrollView>
      <Footer>
        <Button
          title={done ? 'Check and save' : 'Pittu is reading…'}
          onPress={onContinue}
          disabled={!done}
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
  return out;
}

/** One line of the feed; it fades in where it lands (no sliding). */
function Line({
  kind,
  icon,
  label,
  value,
}: {
  kind: 'said' | 'current' | 'found' | 'missing';
  icon: IconName;
  label: string;
  value?: string;
}) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(kind === 'found' ? 0.92 : 1));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  const found = kind === 'found';
  return (
    <Animated.View style={[styles.line, { opacity, transform: [{ scale }] }]}>
      <View
        style={[
          styles.lineIcon,
          found && styles.foundIcon,
          kind === 'missing' && styles.missingIcon,
        ]}
      >
        {kind === 'current' ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon
            name={icon}
            size={found ? 16 : 14}
            color={
              found ? accents.teal.fg : kind === 'missing' ? colors.warning : colors.textSubtle
            }
            strokeWidth={2.4}
          />
        )}
      </View>
      <View style={styles.flex}>
        {found ? (
          <>
            <Text style={typography.caption}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </>
        ) : (
          <Text
            style={[
              styles.said,
              kind === 'current' && styles.current,
              kind === 'missing' && styles.missing,
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

function DoneBadge() {
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <View style={styles.badgeBox}>
      <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
        <Icon name="check" size={46} color={accents.teal.fg} strokeWidth={2.8} />
      </Animated.View>
    </View>
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
  badgeBox: { width: 220, height: 190, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feed: { padding: space.lg, paddingTop: space.xl, gap: space.md },
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
