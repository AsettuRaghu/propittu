import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '@/api/client';
import { colors, font, radius, shadowStrong, space, typography } from '@/theme';
import { Icon } from './Icon';

export interface FoundPlace {
  latitude: number;
  longitude: number;
  label: string;
  detail: string;
}

/**
 * "Search a village, layout or landmark" over the map. It searches when the
 * customer presses Search (OpenStreetMap's rules: no search-as-you-type),
 * lists what it found, and hands the chosen place to `onPick`.
 */
export function MapSearch({ onPick }: { onPick: (place: FoundPlace) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FoundPlace[] | null>(null);

  const search = async () => {
    const text = q.trim();
    if (text.length < 3) return;
    setBusy(true);
    try {
      setResults(await api<FoundPlace[]>(`/geo/search?q=${encodeURIComponent(text)}`));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const pick = (p: FoundPlace) => {
    Keyboard.dismiss();
    setResults(null);
    setQ(p.label);
    onPick(p);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, shadowStrong]}>
        <Icon name="search" size={18} color={colors.textSubtle} />
        <TextInput
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (results) setResults(null);
          }}
          placeholder="Search a village, layout or landmark"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
          style={styles.input}
          autoCorrect={false}
        />
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : q ? (
          <Pressable
            onPress={() => {
              setQ('');
              setResults(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close" size={16} color={colors.textSubtle} />
          </Pressable>
        ) : null}
      </View>

      {results ? (
        <View style={[styles.results, shadowStrong]}>
          {results.length === 0 ? (
            <Text style={[typography.small, styles.empty]}>
              Nothing found — try the village or taluk name.
            </Text>
          ) : (
            results.map((r, i) => (
              <Pressable
                key={`${i}-${r.label}`}
                onPress={() => pick(r)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.result,
                  i > 0 && styles.divider,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Icon name="pin" size={16} color={colors.primary} />
                <View style={styles.flex}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {r.label}
                  </Text>
                  {r.detail ? (
                    <Text style={typography.caption} numberOfLines={1}>
                      {r.detail}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: space.xs },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    height: 46,
  },
  input: { flex: 1, fontSize: font(15), color: colors.text, paddingVertical: 0 },
  results: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  empty: { padding: space.md },
});
