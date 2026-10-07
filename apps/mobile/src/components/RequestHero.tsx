import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  PREFERRED_SLOT_LABELS,
  requestExpectedBy,
  type ServiceRequestDetail,
} from '@propittu/shared';
import { formatDate } from '@/lib/format';
import { serviceVisual } from '@/lib/icons';
import { accents, colors, font, radius, space } from '@/theme';
import { Icon, type IconName } from './Icon';

/** What's happening, in plain words — the hero's headline and the line under it. */
function headline(r: ServiceRequestDetail): { title: string; line: string | null } {
  const visit = r.fulfilment === 'visit';
  const expected = requestExpectedBy(r);
  const by = expected ? `Expected by ${formatDate(expected)}` : null;
  switch (r.status) {
    case 'requested':
      return { title: 'Request received', line: 'We’ll confirm it within a working day' };
    case 'confirmed':
      return {
        title: visit ? 'Accepted — scheduling your visit' : 'Accepted — starting shortly',
        line: by,
      };
    case 'scheduled':
      return {
        title: `Visit on ${r.scheduled_for ? formatDate(r.scheduled_for) : 'the agreed day'}`,
        line: r.preferred_slot ? `${PREFERRED_SLOT_LABELS[r.preferred_slot]} visit` : by,
      };
    case 'in_progress':
      return { title: visit ? 'Our team is on it' : 'We’re working on it', line: by };
    case 'awaiting_customer':
      return { title: 'We need something from you', line: 'Reply below so we can carry on' };
    case 'completed':
      return {
        title: r.report ? 'Done — your report is ready' : 'Done',
        line: r.completed_at ? `Completed ${formatDate(r.completed_at)}` : null,
      };
    case 'cancelled':
      return {
        title: 'Cancelled',
        line: r.cancelled_at ? formatDate(r.cancelled_at) : null,
      };
  }
}

interface Stage {
  label: string;
  icon: IconName;
}

/** The stages of this kind of request, and how far it has got (−1 when cancelled). */
function stages(r: ServiceRequestDetail): { list: Stage[]; reached: number } {
  const visit = r.fulfilment === 'visit';
  const list: Stage[] = visit
    ? [
        { label: 'Requested', icon: 'clock' },
        { label: 'Accepted', icon: 'check' },
        { label: 'Scheduled', icon: 'calendar' },
        { label: 'On it', icon: 'bolt' },
        { label: 'Done', icon: 'success' },
      ]
    : [
        { label: 'Requested', icon: 'clock' },
        { label: 'Accepted', icon: 'check' },
        { label: 'Working', icon: 'bolt' },
        { label: 'Done', icon: 'success' },
      ];
  const order = visit
    ? ['requested', 'confirmed', 'scheduled', 'in_progress', 'completed']
    : ['requested', 'confirmed', 'in_progress', 'completed'];
  const at = r.status === 'awaiting_customer' ? 'in_progress' : r.status;
  return { list, reached: r.status === 'cancelled' ? -1 : order.indexOf(at) };
}

/**
 * The top of a service request: the service's colours, what and where, a
 * plain-language headline for where things stand, the key date, and the
 * stages — the current one gently pulsing, so it feels alive.
 */
export function RequestHero({ request: r }: { request: ServiceRequestDetail }) {
  const v = serviceVisual(r.service.code, r.service.category);
  const { title, line } = headline(r);
  const { list, reached } = stages(r);
  const done = r.status === 'completed';
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <LinearGradient
      colors={
        r.status === 'cancelled'
          ? [colors.textMuted, colors.textSubtle]
          : [accents[v.accent].fg, colors.primary]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.top}>
        <View style={styles.icon}>
          <Icon name={v.icon} size={22} color="#FFFFFF" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.service} numberOfLines={1}>
            {r.service.name}
          </Text>
          <Text style={styles.property} numberOfLines={2}>
            {r.property?.name ?? 'Property removed'}
          </Text>
        </View>
      </View>

      <View style={styles.status}>
        <Text style={styles.title}>{title}</Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>

      {reached >= 0 ? (
        <View style={styles.track} accessibilityLabel={`Step ${reached + 1} of ${list.length}`}>
          {list.map((s, i) => {
            const passed = i < reached || (done && i === reached);
            const current = i === reached && !done;
            return (
              <View key={s.label} style={styles.stage}>
                <View style={styles.dotRow}>
                  <View
                    style={[styles.bar, i === 0 && styles.hidden, i <= reached && styles.barOn]}
                  />
                  <View style={styles.dotWrap}>
                    {current ? (
                      <Animated.View
                        style={[
                          styles.halo,
                          {
                            opacity: pulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.5, 0],
                            }),
                            transform: [
                              {
                                scale: pulse.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 1.8],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                    ) : null}
                    <View style={[styles.dot, (passed || current) && styles.dotOn]}>
                      <Icon
                        name={s.icon}
                        size={13}
                        color={passed || current ? colors.primary : 'rgba(255,255,255,0.7)'}
                        strokeWidth={2.6}
                      />
                    </View>
                  </View>
                  <View
                    style={[
                      styles.bar,
                      i === list.length - 1 && styles.hidden,
                      i < reached && styles.barOn,
                    ]}
                  />
                </View>
                <Text
                  style={[styles.stageLabel, (passed || current) && styles.stageOn]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  service: { fontSize: font(16), fontWeight: '700', color: '#FFFFFF' },
  property: { fontSize: font(13), color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  status: { gap: 4 },
  title: { fontSize: font(24), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  line: { fontSize: font(15), color: 'rgba(255,255,255,0.9)' },
  track: { flexDirection: 'row' },
  stage: { flex: 1, alignItems: 'center', gap: 6 },
  dotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  bar: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  barOn: { backgroundColor: '#FFFFFF' },
  hidden: { opacity: 0 },
  dotWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  stageLabel: { fontSize: font(11), fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  stageOn: { color: '#FFFFFF' },
});
