import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { markSplashDone } from '@/lib/splash';
import { accents, colors } from '@/theme';
import { Icon, type IconName } from './Icon';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AG = Animated.createAnimatedComponent(G);

const HOUSE_LEN = 260;
const DOOR_LEN = 70;

const CHIPS: { icon: IconName; label: string }[] = [
  { icon: 'document', label: 'Documents' },
  { icon: 'images', label: 'Photos' },
  { icon: 'services', label: 'Services' },
];

/**
 * The welcome moment (~4 s; a tap skips it): a home draws itself as the
 * sun rises, its windows light up, a tree grows and a "cared for" badge
 * lands — then Propittu, "Your Property. Our Care." and what it keeps
 * together. It sits ON TOP of the app, which loads underneath, so it never
 * delays anything; screens wait for it before raising the keyboard.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const [v] = useState(() => ({
    sun: new Animated.Value(0),
    house: new Animated.Value(0),
    door: new Animated.Value(0),
    lights: new Animated.Value(0),
    tree: new Animated.Value(0),
    badge: new Animated.Value(0),
    word: new Animated.Value(0),
    tagline: new Animated.Value(0),
    chips: CHIPS.map(() => new Animated.Value(0)),
    fade: new Animated.Value(1),
  }));

  useEffect(() => {
    const t = (value: Animated.Value, duration: number, delay = 0, native = false) =>
      Animated.timing(value, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: native,
      });
    const finish = () => {
      markSplashDone();
      onDone();
    };
    // SVG props can't use the native driver; plain views can.
    const anim = Animated.sequence([
      Animated.parallel([
        t(v.sun, 1100),
        t(v.house, 1300, 150),
        t(v.door, 500, 1100),
        t(v.lights, 450, 1450),
        Animated.spring(v.tree, {
          toValue: 1,
          delay: 1350,
          damping: 9,
          stiffness: 140,
          useNativeDriver: false,
        }),
        Animated.spring(v.badge, {
          toValue: 1,
          delay: 1750,
          damping: 8,
          stiffness: 160,
          useNativeDriver: true,
        }),
        t(v.word, 500, 1900, true),
        t(v.tagline, 500, 2200, true),
        ...v.chips.map((c, i) => t(c, 380, 2550 + i * 170, true)),
      ]),
      Animated.delay(900),
      Animated.timing(v.fade, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && finish());
    return () => anim.stop();
  }, [v, onDone]);

  const skip = () => {
    markSplashDone();
    onDone();
  };

  const rise = (value: Animated.Value, by = 10) => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }],
  });

  return (
    <Animated.View style={[styles.wrap, { opacity: v.fade }]}>
      <LinearGradient
        colors={['#FFFFFF', accents.indigo.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip" />

      <View style={styles.scene} pointerEvents="none">
        <Svg width={220} height={180} viewBox="0 0 160 130">
          {/* Sun rising behind the home */}
          <ACircle
            cx={80}
            cy={v.sun.interpolate({ inputRange: [0, 1], outputRange: [86, 40] })}
            r={30}
            fill={accents.amber.bg}
            opacity={v.sun}
          />
          <Line
            x1={8}
            y1={118}
            x2={152}
            y2={118}
            stroke={colors.border}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Windows light up */}
          <AG opacity={v.lights}>
            <Rect x={45} y={74} width={16} height={14} rx={2} fill="#FCD34D" />
            <Rect x={99} y={74} width={16} height={14} rx={2} fill="#FCD34D" />
          </AG>
          {/* The home draws itself */}
          <APath
            d="M34 118 V64 L80 28 L126 64 V118"
            stroke={colors.primary}
            strokeWidth={4.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={HOUSE_LEN}
            strokeDashoffset={v.house.interpolate({
              inputRange: [0, 1],
              outputRange: [HOUSE_LEN, 0],
            })}
          />
          <APath
            d="M70 118 V93 H90 V118"
            stroke={colors.primary}
            strokeWidth={4}
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={DOOR_LEN}
            strokeDashoffset={v.door.interpolate({
              inputRange: [0, 1],
              outputRange: [DOOR_LEN, 0],
            })}
          />
          {/* A tree grows */}
          <AG opacity={v.tree}>
            <Line x1={143} y1={118} x2={143} y2={104} stroke="#8B5E34" strokeWidth={3} />
            <ACircle
              cx={143}
              cy={96}
              r={v.tree.interpolate({ inputRange: [0, 1], outputRange: [2, 11] })}
              fill={accents.teal.fg}
            />
          </AG>
        </Svg>
        <Animated.View
          style={[styles.badge, { opacity: v.badge, transform: [{ scale: v.badge }] }]}
        >
          <Icon name="shield" size={18} color="#FFFFFF" strokeWidth={2.4} />
        </Animated.View>
      </View>

      <Animated.Text style={[styles.word, rise(v.word, 12)]} pointerEvents="none">
        Propittu
      </Animated.Text>
      <Animated.View style={rise(v.tagline, 8)} pointerEvents="none">
        <Text style={styles.tagline}>Your Property. Our Care.</Text>
      </Animated.View>

      <View style={styles.chips} pointerEvents="none">
        {CHIPS.map((c, i) => (
          <Animated.View key={c.label} style={[styles.chip, rise(v.chips[i] as Animated.Value, 6)]}>
            <Icon name={c.icon} size={13} color={colors.primary} />
            <Text style={styles.chipText}>{c.label}</Text>
          </Animated.View>
        ))}
      </View>

      <Text style={styles.skip} pointerEvents="none">
        Tap to continue
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  scene: { width: 220, height: 180, marginBottom: 8 },
  badge: {
    position: 'absolute',
    right: 34,
    bottom: 22,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: accents.teal.fg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  word: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  tagline: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  chips: { flexDirection: 'row', gap: 8, marginTop: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  skip: { position: 'absolute', bottom: 48, fontSize: 12, color: colors.textSubtle },
});
