/**
 * Design tokens. Deliberately small (PRODUCT_SPEC.md §38): clear type,
 * consistent spacing, one primary colour, clear status colours.
 * Light mode only for V1 (app.json userInterfaceStyle).
 */

export const colors = {
  primary: '#0F5E4C',
  primaryPressed: '#0B4A3C',
  primarySoft: '#E6F2EF',
  onPrimary: '#FFFFFF',

  background: '#F6F7F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F3F2',
  border: '#E3E6E4',
  borderStrong: '#C9CFCC',

  text: '#14201C',
  textMuted: '#5D6964',
  textSubtle: '#8A948F',

  danger: '#B42318',
  dangerSoft: '#FEF3F2',
  warning: '#B54708',
  warningSoft: '#FFFAEB',
  success: '#067647',
  successSoft: '#ECFDF3',
  info: '#175CD3',
  infoSoft: '#EFF8FF',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: '600', color: colors.text },
  small: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  caption: { fontSize: 12, color: colors.textSubtle },
  overline: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const;
