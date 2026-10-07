import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { accents } from '@/theme';
import { Icon } from './Icon';

/*
 * Small pieces of delight for Pittu's screens. Fades, pulses and sparkles
 * only — nothing slides across the screen. All run on the native driver.
 */

const breathe = (v: Animated.Value, duration: number, delay = 0) =>
  Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]),
  );

/** Soft orbs of light drifting slowly behind a gradient — the screen is never still. */
export function AmbientGlow() {
  const [a] = useState(() => new Animated.Value(0));
  const [b] = useState(() => new Animated.Value(0));
  const [c] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loops = [breathe(a, 4200), breathe(b, 5200, 600), breathe(c, 3600, 1200)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [a, b, c]);
  const orb = (v: Animated.Value, dx: number, dy: number, grow: number) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, grow] }) },
    ],
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.orb, styles.orbA, orb(a, -24, 18, 1.12)]} />
      <Animated.View style={[styles.orb, styles.orbB, orb(b, 20, -16, 1.18)]} />
      <Animated.View style={[styles.orb, styles.orbC, orb(c, 12, 12, 1.25)]} />
    </View>
  );
}

const BURST = 12;

/**
 * Pittu is done: a tick springs in, sparkles burst out once, a soft halo
 * keeps breathing and little sparkles keep circling — until the customer
 * moves on.
 */
export function CelebrationBadge({ size = 96 }: { size?: number }) {
  const [pop] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [halo] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [twinkle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
    Animated.timing(burst, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loops = [
      Animated.loop(
        Animated.timing(halo, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 9000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      breathe(twinkle, 700),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pop, burst, halo, spin, twinkle]);

  const box = size * 2.2;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      {/* One burst of sparkles, flying out and fading. */}
      {Array.from({ length: BURST }, (_, i) => {
        const angle = (i / BURST) * Math.PI * 2;
        const reach = size * (0.85 + (i % 3) * 0.12);
        return (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              {
                opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [
                  {
                    translateX: burst.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.cos(angle) * reach],
                    }),
                  },
                  {
                    translateY: burst.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.sin(angle) * reach],
                    }),
                  },
                  { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) },
                ],
              },
            ]}
          >
            <View style={[styles.sparkDot, i % 2 ? styles.sparkGold : null]} />
          </Animated.View>
        );
      })}

      {/* The halo keeps breathing out from the badge. */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          },
        ]}
      />

      {/* Little sparkles circling. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        {[0, 1, 2].map((i) => {
          const angle = (i / 3) * Math.PI * 2;
          const r = size * 0.78;
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: box / 2 + Math.cos(angle) * r - 9,
                top: box / 2 + Math.sin(angle) * r - 9,
                opacity: twinkle.interpolate({
                  inputRange: [0, 1],
                  outputRange: i === 1 ? [1, 0.35] : [0.35, 1],
                }),
              }}
            >
              <Icon name="sparkles" size={18} color={i === 1 ? '#FFD38A' : '#FFFFFF'} />
            </Animated.View>
          );
        })}
      </Animated.View>

      <Animated.View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          },
        ]}
      >
        <Icon
          name="check"
          size={Math.round(size * 0.46)}
          color={accents.teal.fg}
          strokeWidth={2.8}
        />
      </Animated.View>
    </View>
  );
}

/** A gentle, glowing pulse that invites a tap (e.g. the button once Pittu is done). */
export function Beckon({ active, children }: { active: boolean; children: ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const l = breathe(v, 900);
    l.start();
    return () => {
      l.stop();
      v.setValue(0);
    };
  }, [active, v]);
  return (
    <View>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.beckonGlow,
            {
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] }),
              transform: [
                { scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
              ],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={{
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** Fades its content in whenever `id` changes (e.g. a headline moving on). */
export function FadeSwap({ id, children }: { id: string; children: ReactNode }) {
  return <FadeIn key={id}>{children}</FadeIn>;
}

function FadeIn({ children }: { children: ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        alignSelf: 'stretch',
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  orbA: { width: 320, height: 320, top: -140, right: -120 },
  orbB: { width: 260, height: 260, bottom: 60, left: -120 },
  orbC: {
    width: 180,
    height: 180,
    top: '38%',
    right: -60,
    backgroundColor: 'rgba(255,211,138,0.07)',
  },
  spark: { position: 'absolute' },
  sparkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  sparkGold: { backgroundColor: '#FFD38A' },
  halo: { position: 'absolute', backgroundColor: '#FFFFFF' },
  badge: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E1B4B',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  beckonGlow: {
    position: 'absolute',
    left: -6,
    right: -6,
    top: -6,
    bottom: -6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
});
