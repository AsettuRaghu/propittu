import { Platform, type ViewStyle } from 'react-native';

/**
 * Propittu design tokens.
 *
 * One calm, trustworthy primary (deep indigo) plus a family of SOFT accent
 * tints. Accents are used sparingly — icon tiles, chips, the occasional
 * gradient hero — so screens feel lively without shouting. Each area of
 * the app owns one accent (see `accents`), which keeps colour
 * meaningful and consistent everywhere.
 *
 * Light mode only for V1 (app.json userInterfaceStyle).
 */

export const colors = {
  primary: '#4338CA',
  primaryPressed: '#3730A3',
  primarySoft: '#EEF0FF',
  primaryBorder: '#C7CCFB',
  onPrimary: '#FFFFFF',

  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2F7',
  border: '#E6E8F0',
  borderStrong: '#CDD2DF',

  text: '#141833',
  textMuted: '#5A6079',
  textSubtle: '#959AAF',

  danger: '#DC2626',
  dangerSoft: '#FDEEEE',
  warning: '#C2410C',
  warningSoft: '#FFF4EA',
  success: '#15803D',
  successSoft: '#EAF7EF',
  info: '#2563EB',
  infoSoft: '#EDF3FF',

  overlay: 'rgba(20, 24, 51, 0.45)',
} as const;

/** Soft accent family: strong colour for icons/text, soft tint for backgrounds. */
export const accents = {
  indigo: { fg: '#4338CA', bg: '#EEF0FF' },
  violet: { fg: '#7C3AED', bg: '#F3EEFF' },
  sky: { fg: '#0284C7', bg: '#E8F5FD' },
  teal: { fg: '#0F9488', bg: '#E5F7F5' },
  amber: { fg: '#C2730A', bg: '#FFF5E3' },
  coral: { fg: '#E5533D', bg: '#FFEFEB' },
  rose: { fg: '#DB2777', bg: '#FDEEF5' },
  slate: { fg: '#5A6079', bg: '#F0F2F7' },
} as const;
export type Accent = keyof typeof accents;

/** Gradient heroes — used on a few highlight cards only. */
export const gradients = {
  brand: ['#4338CA', '#6D3FE0'],
  plus: ['#6D3FE0', '#C2378F'],
  basic: ['#0284C7', '#4338CA'],
  trial: ['#0F9488', '#0284C7'],
  limited: ['#5A6079', '#3B3F58'],
  visit: ['#4338CA', '#0F9488'],
} as const satisfies Record<string, readonly [string, string]>;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 9,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Compact type scale: titles fit on one line on a phone. */
export const typography = {
  display: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600', color: colors.text },
  small: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  caption: { fontSize: 12, color: colors.textSubtle },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSubtle,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
} as const;

/** Soft elevation for cards. */
export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#141833',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  default: { elevation: 2 },
}) as ViewStyle;

export const shadowStrong: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#141833',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  default: { elevation: 8 },
}) as ViewStyle;
