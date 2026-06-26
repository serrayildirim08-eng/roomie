/**
 * Roomie design system — "Direction D": a bold forest-green editorial header
 * over big, tactile, joyful cards. Baloo 2 for display/numbers, Nunito for body.
 * Every roommate carries an identity color (never a score).
 *
 * Key names from the old warm-linen theme are KEPT and remapped onto the new
 * palette, so existing screens shift to the new look without a rewrite.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Roomie = {
  // surfaces
  canvas: '#F4F1EA', // app background (warm paper)
  card: '#FFFFFF', // cards float white on the canvas
  surface: '#FFFFFF',
  input: '#FFFFFF',

  // ink scale
  ink: '#16201B', // primary text
  sub: '#566159', // secondary text
  ink3: '#8A958F', // tertiary / timestamps
  hairline: '#E8E3D9', // soft borders / row rules
  rule: '#E8E3D9',

  // brand greens (the lead)
  accent: '#1A6B43', // primary action / selected — deep forest
  forest: '#1A6B43',
  forest2: '#268A57', // lighter forest for gradients
  forestInk: '#0F3D27', // darkest, gradient base + titles on light
  onAccent: '#FFFFFF',
  sage: '#1A6B43',
  sageSoft: '#E6F4EC', // soft green wash (active tab, "good" pills)

  // bright pops (used sparingly)
  coral: '#FF6A3D',
  pink: '#FF4D8D',
  gold: '#FFCB2E',
  danger: '#E0452B',

  // chunky drop-edge button under-shadows
  dropGreen: '#114E30',
  dropGold: '#D9A800',
  dropCoral: '#D8501F',
  dropPink: '#D11A66',
} as const;

// Each roommate gets a stable color from a seed (their userId). Color is
// identity, never a ranking.
export const PersonColors = [
  '#1A6B43', // forest
  '#5B8DEF', // blue
  '#FF4D8D', // pink
  '#FF6A3D', // coral
  '#268A57', // green
  '#C98A00', // ochre
] as const;

export function personColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PersonColors[h % PersonColors.length];
}

export const RoomieFonts = {
  display: 'Baloo2_700Bold', // titles, chore names, hero
  displayBold: 'Baloo2_800ExtraBold', // big numbers, hero stat
  displaySemi: 'Baloo2_600SemiBold', // section heads, buttons
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
} as const;

// Shared shape tokens so screens stay consistent.
export const Radius = {
  pill: 999,
  card: 24,
  hero: 34,
  button: 16,
  chip: 14,
  icon: 14,
} as const;

export const Colors = {
  light: {
    text: Roomie.ink,
    background: Roomie.surface,
    backgroundElement: Roomie.sageSoft,
    backgroundSelected: Roomie.sageSoft,
    textSecondary: Roomie.sub,
    tint: Roomie.forest,
  },
  dark: {
    text: '#ffffff',
    background: '#0F1713',
    backgroundElement: '#1B2A22',
    backgroundSelected: '#24372C',
    textSecondary: '#B0BCB4',
    tint: '#3FAE72',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
