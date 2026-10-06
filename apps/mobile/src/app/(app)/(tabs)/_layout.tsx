import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/Icon';
import { colors, radius } from '@/theme';

/**
 * Three tabs rather than §39's suggested four: §15's Home already IS the
 * property list, so a separate Properties tab would show it twice.
 * See docs/DECISIONS.md.
 *
 * Each tab hosts its own stack (the shared `(home,services,profile)`
 * folder), so the tab bar stays visible everywhere. Tapping the tab you are
 * already in returns to its first screen.
 */
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[styles.icon, focused && styles.iconFocused]}>
      <Icon
        name={name}
        size={22}
        color={focused ? colors.primary : colors.textSubtle}
        strokeWidth={focused ? 2.4 : 2}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="(services)"
        options={{
          title: 'Services',
          tabBarIcon: ({ focused }) => <TabIcon name="services" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFocused: { backgroundColor: colors.primarySoft },
});
