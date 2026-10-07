import { useState, type ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { IconButton, IconTile } from './ui';

/**
 * A list row whose value is edited in place: tap, type, tick (or the
 * keyboard's Done) to save. The new value shows at once while it saves;
 * on failure the row stays in edit mode with the message, nothing lost.
 * Put it in a ScrollView with keyboardShouldPersistTaps="handled" so the
 * first tap on the tick saves instead of only closing the keyboard.
 */
export function InlineEdit({
  icon,
  label,
  value,
  placeholder,
  onSave,
  validate,
  badge,
  hideLabel = false,
  inputProps,
}: {
  icon: IconName;
  /** Names the field for screen readers; shown above the value unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  value: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<unknown>;
  validate?: (value: string) => string | null;
  /** Shown on the right when not editing (e.g. Complete / Incomplete). */
  badge?: ReactNode;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'style'>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  const display = shown ?? value;

  const save = async () => {
    const next = (draft ?? '').trim();
    if (next === (display ?? '')) return setDraft(null);
    const problem = validate?.(next) ?? null;
    if (problem) return setError(problem);
    Keyboard.dismiss();
    setShown(next);
    setDraft(null);
    try {
      await onSave(next);
    } catch (err) {
      setShown(null);
      setDraft(next);
      setError(err instanceof Error ? err.message : "Couldn't save");
    }
  };

  const cancel = () => {
    Keyboard.dismiss();
    setDraft(null);
    setError(null);
  };

  return (
    <View>
      <Pressable
        onPress={() => !editing && setDraft(display ?? '')}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label}`}
        style={styles.row}
      >
        <IconTile icon={icon} accent="indigo" size={30} />
        <View style={styles.flex}>
          {hideLabel ? null : <Text style={typography.caption}>{label}</Text>}
          {editing ? (
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                setError(null);
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.textSubtle}
              autoFocus
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={() => void save()}
              style={[typography.bodyStrong, styles.input]}
              {...inputProps}
            />
          ) : (
            <Text
              style={[typography.bodyStrong, !display && { color: colors.textSubtle }]}
              numberOfLines={1}
            >
              {display || placeholder}
            </Text>
          )}
        </View>
        {editing ? (
          <View style={styles.actions}>
            <IconButton icon="close" label="Cancel" variant="plain" size={32} onPress={cancel} />
            <IconButton
              icon="check"
              label="Save"
              variant="soft"
              size={32}
              onPress={() => void save()}
            />
          </View>
        ) : (
          <View style={styles.actions}>
            {badge}
            <Icon name="edit" size={16} color={colors.textSubtle} />
          </View>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.primary,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  error: { ...typography.caption, color: colors.danger, paddingHorizontal: 14, paddingBottom: 8 },
});
