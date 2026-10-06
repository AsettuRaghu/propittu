import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';
import { useProperty, useUpdateProperty } from '@/api/queries';
import { toast } from '@/components/Dialog';
import { Icon } from '@/components/Icon';
import { ErrorState, LoadingState } from '@/components/States';
import { Banner, Button, IconButton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { accents, colors, radius, shadowStrong, space, typography } from '@/theme';

/** The phone's geocoder can stall; never keep the owner waiting on it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Whole-India view when nothing better is known. */
const INDIA: Region = { latitude: 21.0, longitude: 78.9, latitudeDelta: 22, longitudeDelta: 22 };
const CLOSE = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

type Origin = 'saved' | 'address' | 'none';

/**
 * Location (M2): address → approximate map position → the owner confirms
 * or moves the pin → coordinates saved as a USER-confirmed location.
 * Geocoding runs on the phone's own geocoder (no API key, no cost).
 */
export default function PropertyLocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: property, isPending, error, refetch } = useProperty(id);
  const update = useUpdateProperty(id);
  const mapRef = useRef<MapView>(null);

  const [initial, setInitial] = useState<{ region: Region; origin: Origin } | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const insets = useSafeAreaInsets();

  // Work out where to start: saved pin → geocoded address → all of India.
  useEffect(() => {
    if (!property || initial) return;
    let cancelled = false;
    (async () => {
      if (property.latitude !== null && property.longitude !== null) {
        const saved = { latitude: property.latitude, longitude: property.longitude };
        if (!cancelled) {
          setPin(saved);
          setInitial({ region: { ...saved, ...CLOSE }, origin: 'saved' });
        }
        return;
      }
      const query = [
        property.address_line,
        property.city,
        property.state,
        property.pincode,
        'India',
      ]
        .filter(Boolean)
        .join(', ');
      try {
        const hits = query ? await withTimeout(Location.geocodeAsync(query), 6000) : null;
        const hit = hits?.[0];
        if (hit && !cancelled) {
          const approx = { latitude: hit.latitude, longitude: hit.longitude };
          setPin(approx);
          setInitial({
            region: { ...approx, latitudeDelta: 0.03, longitudeDelta: 0.03 },
            origin: 'address',
          });
          return;
        }
      } catch {
        // Geocoding unavailable: fall through to the India view.
      }
      if (!cancelled) setInitial({ region: INDIA, origin: 'none' });
    })();
    return () => {
      cancelled = true;
    };
  }, [property, initial]);

  const useMyLocation = async () => {
    setMessage(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage('Location access is off. You can still tap the map to place the pin.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setPin(here);
      mapRef.current?.animateToRegion({ ...here, ...CLOSE }, 400);
    } catch {
      setMessage("Couldn't get your current location. Tap the map to place the pin instead.");
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    if (!pin) return;
    update.mutate(
      { latitude: Number(pin.latitude.toFixed(6)), longitude: Number(pin.longitude.toFixed(6)) },
      {
        onSuccess: () => {
          toast('Location saved');
          router.back();
        },
      },
    );
  };

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!initial) return <LoadingState label="Finding your property on the map…" />;

  const hint =
    initial.origin === 'address' && pin
      ? 'Approximate position from the address. Drag the pin or tap the map to mark the exact spot.'
      : initial.origin === 'saved'
        ? 'Drag the pin or tap the map to adjust the location.'
        : 'Tap the map to place a pin on your property.';

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        initialRegion={initial.region}
        onPress={(e) => setPin(e.nativeEvent.coordinate)}
        showsUserLocation
        mapType={satellite ? 'hybrid' : 'standard'}
      >
        {pin ? (
          <Marker
            coordinate={pin}
            draggable
            onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
            pinColor={colors.primary}
            title={property.name}
          />
        ) : null}
      </MapView>

      {/* Floating map controls */}
      <View style={styles.controls}>
        <View style={[styles.controlBg, shadowStrong]}>
          <IconButton
            icon={satellite ? 'map' : 'satellite'}
            label={satellite ? 'Map view' : 'Satellite view'}
            variant="plain"
            onPress={() => setSatellite((v) => !v)}
          />
        </View>
        <View style={[styles.controlBg, shadowStrong]}>
          {locating ? (
            <ActivityIndicator style={styles.controlSpinner} color={colors.primary} />
          ) : (
            <IconButton
              icon="locate"
              label="Use my current location"
              variant="plain"
              onPress={useMyLocation}
            />
          )}
        </View>
      </View>

      {/* Bottom sheet: hint + confirm */}
      <View
        style={[styles.sheet, shadowStrong, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
      >
        <View style={styles.hintRow}>
          <View style={styles.hintIcon}>
            <Icon name="pin" size={18} color={accents.teal.fg} />
          </View>
          <Text style={[typography.small, styles.flex]}>{hint}</Text>
        </View>
        {message ? <Banner message={message} tone="warning" /> : null}
        {update.error ? <Banner message={errorMessage(update.error)} /> : null}
        <Button
          title={pin ? 'Confirm location' : 'Tap the map to place the pin'}
          icon={pin ? 'check' : 'pin'}
          onPress={save}
          loading={update.isPending}
          disabled={!pin}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { position: 'absolute', top: space.md, right: space.md, gap: space.sm },
  controlBg: { backgroundColor: colors.surface, borderRadius: radius.pill },
  controlSpinner: { width: 40, height: 40 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hintIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: accents.teal.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
