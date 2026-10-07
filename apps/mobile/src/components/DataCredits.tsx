import { Linking, StyleSheet, Text } from 'react-native';
import { typography } from '@/theme';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

/**
 * Credits the open data we use, as their licences require: place names and
 * PIN code areas © OpenStreetMap contributors (ODbL), weather from MET
 * Norway (CC BY 4.0). Shown wherever that data appears.
 */
export function DataCredits({
  weather = false,
  tone = 'default',
}: {
  weather?: boolean;
  tone?: 'default' | 'light';
}) {
  return (
    <Text style={[typography.caption, styles.credit, tone === 'light' && styles.light]}>
      {weather ? 'Weather: MET Norway (CC BY 4.0) · ' : ''}Places:{' '}
      <Text
        style={styles.link}
        onPress={() => void Linking.openURL(OSM_COPYRIGHT).catch(() => undefined)}
        accessibilityRole="link"
      >
        © OpenStreetMap contributors
      </Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  credit: { textAlign: 'center' },
  light: { color: 'rgba(255,255,255,0.75)' },
  link: { textDecorationLine: 'underline' },
});
