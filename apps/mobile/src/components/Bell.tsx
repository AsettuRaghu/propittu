import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInbox } from '@/api/notifications';
import { colors, font } from '@/theme';
import { Icon } from './Icon';

/** Home: the bell, with how many notifications are unread. */
export function Bell() {
  const unread = useInbox().data?.unread ?? 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
    >
      <Icon name="bell" size={22} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: font(10), fontWeight: '800', color: '#FFFFFF' },
});
