import { dialog } from '@/components/Dialog';

/**
 * Drop-in for React Native's Alert.alert(title, message, buttons) that shows
 * Propittu's styled dialogs instead of the system popup:
 *   no buttons / OK only     → info dialog
 *   one action (+ cancel)    → confirm sheet
 *   several actions          → action sheet
 */
interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const failure = /^couldn.t|^could not|failed/i.test(title);

  if (actions.length === 0 || (actions.length === 1 && !cancel && !actions[0]?.onPress)) {
    void dialog
      .alert({
        title,
        message,
        buttonLabel: actions[0]?.text ?? 'OK',
        tone: failure ? 'danger' : 'primary',
      })
      .then(() => actions[0]?.onPress?.());
    return;
  }

  if (actions.length === 1) {
    const action = actions[0] as AlertButton;
    void dialog
      .confirm({
        title,
        message,
        confirmLabel: action.text,
        cancelLabel: cancel?.text ?? 'Cancel',
        tone: action.style === 'destructive' ? 'danger' : 'primary',
      })
      .then((ok) => (ok ? action.onPress?.() : cancel?.onPress?.()));
    return;
  }

  void dialog
    .actions({
      title,
      message,
      actions: actions.map((b) => ({
        label: b.text,
        value: b,
        tone: b.style === 'destructive' ? ('danger' as const) : ('default' as const),
      })),
    })
    .then((b) => (b ? b.onPress?.() : cancel?.onPress?.()));
}
