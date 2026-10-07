import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, space, typography } from '@/theme';
import { Icon, type IconName } from './Icon';
import { IconButton, IconTile } from './ui';

/**
 * A list row whose value is edited in place: tap it, type, tick to save.
 * `validate` returns an error message (or null). Saving failures stay in
 * edit mode with the message, so nothing typed is lost.
 */
export function InlineEdit({
  icon,
  label,
  value,
  placeholder,
  onSave,
  validate,
  inputProps,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<unknown>;
  validate?: (value: string) => string | null;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'style'>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;

  const save = async () => {
    const next = (draft ?? '').trim();
    if (next === (value ?? '')) return setDraft(null);
    const problem = validate?.(next) ?? null;
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await onSave(next);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <View>
      <Pressable
        onPress={() => !editing && setDraft(value ?? '')}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label}`}
        style={styles.row}
      >
        <IconTile icon={icon} accent="indigo" size={30} />
        <View style={styles.flex}>
          <Text style={typography.caption}>{label}</Text>
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
              onSubmitEditing={() => void save()}
              editable={!saving}
              style={[typography.bodyStrong, styles.input]}
              {...inputProps}
            />
          ) : (
            <Text
              style={[typography.bodyStrong, !value && { color: colors.textSubtle }]}
              numberOfLines={1}
            >
              {value || placeholder}
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
          <Icon name="edit" size={16} color={colors.textSubtle} />
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
  actions: { flexDirection: 'row', gap: space.xs },
  error: { ...typography.caption, color: colors.danger, paddingHorizontal: 14, paddingBottom: 8 },
});
