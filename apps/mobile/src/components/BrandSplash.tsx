import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, gradients } from '@/theme';
import { Icon } from './Icon';

/**
 * A brief branded moment when the app opens (~2.5 s; a tap skips it). It sits ON TOP of the
 * app — which is already rendering and loading underneath — so it never
 * delays anything. The white background continues the native splash.
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const [logo] = useState(() => new Animated.Value(0));
  const [tagline] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(logo, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(tagline, {
          toValue: 1,
          duration: 420,
          delay: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1600),
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [logo, tagline, fade, onDone]);

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }]}>
      <Pressable style={styles.fill} onPress={onDone} accessibilityLabel="Skip" />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: logo,
            transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          },
        ]}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mark}
        >
          <Icon name="home" size={40} color="#FFFFFF" strokeWidth={1.8} />
        </LinearGradient>
        <Text style={styles.word}>Propittu</Text>
      </Animated.View>
      <Animated.View
        style={{
          opacity: tagline,
          transform: [
            { translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <Text style={styles.tagline}>Your Property. Our Care.</Text>
      </Animated.View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Secure · Organised · Cared for</Text>
      </View>
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', gap: 14 },
  mark: { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
  tagline: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  footer: { position: 'absolute', bottom: 56 },
  footerText: { fontSize: 12, fontWeight: '600', color: colors.textSubtle, letterSpacing: 0.4 },
});
