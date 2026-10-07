import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Gently fades and lifts its content in on first show. `index` staggers a
 * list of sections (60 ms apart) so a page settles in calmly, top to bottom.
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
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
