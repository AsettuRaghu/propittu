import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accents, colors, radius, shadowStrong, space, typography, type Accent } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Button, IconTile } from './ui';

/**
 * Propittu's dialogs — a styled replacement for the system Alert.
 *
 *   await dialog.confirm({ title, message, confirmLabel, tone })  → boolean
 *     (optional: highlights ✓ list, summary price rows, note, accent)
 *   await dialog.alert({ title, message })                        → void
 *   await dialog.actions({ title, actions: [{ label, value }] })  → value | null
 *   toast('Saved')                                                (auto-hides)
 *
 * Imperative (no hooks), so it also works from helpers such as the photo
 * picker. <DialogHost /> is mounted once in the root layout.
 */

type Tone = 'primary' | 'danger' | 'success' | 'warning';

const TONE_ACCENT: Record<Tone, Accent> = {
  primary: 'indigo',
  danger: 'coral',
  success: 'teal',
  warning: 'amber',
};
const TONE_ICON: Record<Tone, IconName> = {
  primary: 'info',
  danger: 'warning',
  success: 'success',
  warning: 'warning',
};

export interface ActionItem<T> {
  label: string;
  value: T;
  icon?: IconName;
  tone?: 'default' | 'danger';
  description?: string;
}

/** A row in a confirm's price summary; `total` is emphasised, `credit` shown in green. */
export interface SummaryRow {
  label: string;
  value: string;
  kind?: 'item' | 'credit' | 'total';
}

interface ConfirmExtras {
  highlights?: string[];
  summary?: SummaryRow[];
  note?: string;
  accent?: Accent;
}

type Request =
  | ({
      kind: 'confirm';
      title: string;
      message?: string;
      confirmLabel: string;
      cancelLabel: string;
      tone: Tone;
      icon?: IconName;
      resolve: (v: boolean) => void;
    } & ConfirmExtras)
  | {
      kind: 'alert';
      title: string;
      message?: string;
      buttonLabel: string;
      tone: Tone;
      icon?: IconName;
      resolve: () => void;
    }
  | {
      kind: 'actions';
      title: string;
      message?: string;
      actions: ActionItem<unknown>[];
      resolve: (v: unknown) => void;
    };

type ToastTone = 'success' | 'info' | 'danger';
interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

let showRequest: ((r: Request) => void) | null = null;
let showToast: ((t: ToastState) => void) | null = null;
let toastSeq = 0;

export const dialog = {
  confirm(
    opts: {
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      tone?: Tone;
      icon?: IconName;
    } & ConfirmExtras,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!showRequest) return resolve(false);
      showRequest({
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        tone: opts.tone ?? 'primary',
        icon: opts.icon,
        highlights: opts.highlights,
        summary: opts.summary,
        note: opts.note,
        accent: opts.accent,
        resolve,
      });
    });
  },
  alert(opts: {
    title: string;
    message?: string;
    buttonLabel?: string;
    tone?: Tone;
    icon?: IconName;
  }): Promise<void> {
    return new Promise((resolve) => {
      if (!showRequest) return resolve();
      showRequest({
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        buttonLabel: opts.buttonLabel ?? 'OK',
        tone: opts.tone ?? 'primary',
        icon: opts.icon,
        resolve,
      });
    });
  },
  actions<T>(opts: {
    title: string;
    message?: string;
    actions: ActionItem<T>[];
  }): Promise<T | null> {
    return new Promise((resolve) => {
      if (!showRequest) return resolve(null);
      showRequest({
        kind: 'actions',
        title: opts.title,
        message: opts.message,
        actions: opts.actions as ActionItem<unknown>[],
        resolve: resolve as (v: unknown) => void,
      });
    });
  },
};

export function toast(message: string, tone: ToastTone = 'success'): void {
  showToast?.({ id: ++toastSeq, message, tone });
}

/* ------------------------------------------------------------------ */

export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [slide] = useState(() => new Animated.Value(0));
  const [toastAnim] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    showRequest = (r) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setRequest(r);
    };
    showToast = (t) => setToastState(t);
    return () => {
      showRequest = null;
      showToast = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    slide.setValue(0);
    Animated.spring(slide, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start();
  }, [request, slide]);

  useEffect(() => {
    if (!toastState) return;
    if (toastState.tone === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        setToastState((t) => (t?.id === toastState.id ? null : t)),
      );
    }, 2600);
    return () => clearTimeout(timer);
  }, [toastState, toastAnim]);

  const close = <T,>(settle: () => T) => {
    Animated.timing(slide, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setRequest(null);
      settle();
    });
  };

  const dismiss = () => {
    if (!request) return;
    if (request.kind === 'confirm') close(() => request.resolve(false));
    else if (request.kind === 'alert') close(() => request.resolve());
    else close(() => request.resolve(null));
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <>
      <Modal visible={request !== null} transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Close" />
        {request ? (
          <Animated.View
            style={[
              styles.sheet,
              shadowStrong,
              { paddingBottom: Math.max(insets.bottom, space.lg), transform: [{ translateY }] },
            ]}
          >
            <View style={styles.handle} />
            {request.kind !== 'actions' ? (
              <View style={styles.center}>
                <IconTile
                  icon={request.icon ?? TONE_ICON[request.tone]}
                  accent={
                    (request.kind === 'confirm' ? request.accent : undefined) ??
                    TONE_ACCENT[request.tone]
                  }
                  size={52}
                />
              </View>
            ) : null}
            <Text style={[typography.title, request.kind !== 'actions' && styles.centerText]}>
              {request.title}
            </Text>
            {request.message ? (
              <Text style={[styles.message, request.kind !== 'actions' && styles.centerText]}>
                {request.message}
              </Text>
            ) : null}

            {request.kind === 'confirm' && request.highlights?.length ? (
              <View style={styles.highlights}>
                {request.highlights.map((h) => (
                  <View key={h} style={styles.highlight}>
                    <View
                      style={[
                        styles.tick,
                        { backgroundColor: accents[request.accent ?? 'indigo'].bg },
                      ]}
                    >
                      <Icon
                        name="check"
                        size={12}
                        strokeWidth={3}
                        color={accents[request.accent ?? 'indigo'].fg}
                      />
                    </View>
                    <Text style={[typography.body, styles.flex]}>{h}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {request.kind === 'confirm' && request.summary?.length ? (
              <View style={styles.summary}>
                {request.summary.map((r) => (
                  <View
                    key={r.label}
                    style={[styles.summaryRow, r.kind === 'total' && styles.summaryTotal]}
                  >
                    <Text
                      style={[
                        r.kind === 'total' ? typography.bodyStrong : typography.small,
                        styles.flex,
                      ]}
                    >
                      {r.label}
                    </Text>
                    <Text
                      style={[
                        r.kind === 'total' ? styles.totalValue : typography.bodyStrong,
                        r.kind === 'credit' && { color: accents.teal.fg },
                      ]}
                    >
                      {r.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {request.kind === 'confirm' && request.note ? (
              <Text style={[typography.caption, styles.centerText]}>{request.note}</Text>
            ) : null}

            {request.kind === 'confirm' ? (
              <View style={styles.buttons}>
                <Button
                  title={request.confirmLabel}
                  variant={request.tone === 'danger' ? 'danger' : 'primary'}
                  onPress={() => close(() => request.resolve(true))}
                />
                <Button
                  title={request.cancelLabel}
                  variant="ghost"
                  onPress={() => close(() => request.resolve(false))}
                />
              </View>
            ) : request.kind === 'alert' ? (
              <View style={styles.buttons}>
                <Button
                  title={request.buttonLabel}
                  onPress={() => close(() => request.resolve())}
                />
              </View>
            ) : (
              <View style={styles.actions}>
                {request.actions.map((a) => {
                  const danger = a.tone === 'danger';
                  return (
                    <Pressable
                      key={a.label}
                      onPress={() => close(() => request.resolve(a.value))}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                    >
                      {a.icon ? (
                        <IconTile icon={a.icon} accent={danger ? 'coral' : 'indigo'} size={38} />
                      ) : null}
                      <View style={styles.flex}>
                        <Text style={[typography.bodyStrong, danger && { color: colors.danger }]}>
                          {a.label}
                        </Text>
                        {a.description ? (
                          <Text style={typography.small}>{a.description}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
                <Button title="Cancel" variant="ghost" onPress={dismiss} />
              </View>
            )}
          </Animated.View>
        ) : null}
      </Modal>

      {toastState ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            shadowStrong,
            {
              top: insets.top + space.sm,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }),
                },
              ],
            },
          ]}
        >
          <Icon
            name={
              toastState.tone === 'danger'
                ? 'error'
                : toastState.tone === 'info'
                  ? 'info'
                  : 'success'
            }
            size={18}
            color={
              toastState.tone === 'danger'
                ? colors.danger
                : toastState.tone === 'info'
                  ? colors.info
                  : accents.teal.fg
            }
          />
          <Text style={styles.toastText} numberOfLines={2}>
            {toastState.message}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    gap: space.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  message: { ...typography.body, color: colors.textMuted },
  buttons: { gap: space.xs, marginTop: space.xs },
  highlights: { gap: 8 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: space.md },
  summaryTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 9,
  },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  actions: { gap: space.xs, marginTop: space.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  actionPressed: { backgroundColor: colors.surfaceMuted },
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  toastText: { ...typography.bodyStrong, flex: 1 },
});
