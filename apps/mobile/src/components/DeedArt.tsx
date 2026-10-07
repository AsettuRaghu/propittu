import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { accents } from '@/theme';
import { Icon, type IconName } from './Icon';

const loop = (value: Animated.Value, duration: number, delay = 0) =>
  Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]),
  );

/** Details Pittu lifts off the page, each glowing in turn around it. */
const BITS: { icon: IconName; style: object; delay: number }[] = [
  { icon: 'pin', style: { left: 0, top: 34 }, delay: 0 },
  { icon: 'area', style: { right: 0, top: 70 }, delay: 700 },
  { icon: 'receipt', style: { left: 8, bottom: 22 }, delay: 1400 },
];

/**
 * A sale deed being read: the page floats gently, a light sweeps down it,
 * a sparkle pulses, and the details it holds glow around it in turn.
 * Fades and gentle drift only — nothing slides across the screen.
 */
export function DeedArt({ size = 1 }: { size?: number }) {
  const [float] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const [spark] = useState(() => new Animated.Value(0));
  const [bits] = useState(() => BITS.map(() => new Animated.Value(0)));

  useEffect(() => {
    const all = [
      loop(float, 2200),
      Animated.loop(
        Animated.timing(sweep, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
      loop(spark, 900),
      ...bits.map((b, i) => loop(b, 1000, BITS[i]!.delay)),
    ];
    all.forEach((a) => a.start());
    return () => all.forEach((a) => a.stop());
  }, [float, sweep, spark, bits]);

  return (
    <View style={[styles.box, { transform: [{ scale: size }] }]} accessible={false}>
      <Animated.View
        style={[
          styles.stack,
          {
            transform: [
              { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
            ],
          },
        ]}
      >
        <View style={[styles.paper, styles.back]} />
        <View style={styles.paper}>
          <View style={styles.seal}>
            <Icon name="deed" size={16} color={accents.indigo.fg} />
          </View>
          {[0.9, 0.7, 0.85, 0.6, 0.8, 0.5].map((w, i) => (
            <View key={i} style={[styles.line, { width: `${w * 100}%` }]} />
          ))}
          <Animated.View
            style={[
              styles.beam,
              {
                transform: [
                  {
                    translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-30, 150] }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(109,63,224,0)', 'rgba(109,63,224,0.35)', 'rgba(109,63,224,0)']}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
        <Animated.View
          style={[
            styles.spark,
            {
              transform: [
                { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
              ],
            },
          ]}
        >
          <Icon name="sparkles" size={18} color={accents.amber.fg} strokeWidth={2.4} />
        </Animated.View>
      </Animated.View>

      {BITS.map((b, i) => (
        <Animated.View
          key={b.icon}
          style={[
            styles.bit,
            b.style,
            {
              opacity: bits[i]!.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
              transform: [
                { scale: bits[i]!.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.05] }) },
              ],
            },
          ]}
        >
          <Icon name={b.icon} size={16} color="#FFFFFF" strokeWidth={2.4} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 220, height: 190, alignItems: 'center', justifyContent: 'center' },
  stack: { width: 128, height: 160 },
  paper: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    paddingTop: 16,
    gap: 9,
    overflow: 'hidden',
    shadowColor: '#1E1B4B',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  back: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '-9deg' }, { translateX: -10 }],
  },
  seal: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: accents.indigo.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  line: { height: 7, borderRadius: 4, backgroundColor: '#E4E6F2' },
  beam: { position: 'absolute', left: 0, right: 0, top: 0, height: 44 },
  spark: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: accents.amber.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bit: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
