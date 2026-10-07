import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Gently fades its content in on first show — opacity only, nothing moves,
 * so the layout never shifts. `index` staggers sections (60 ms apart).
 */
export function FadeIn({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 320,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, [v, index]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}
