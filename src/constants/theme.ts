/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Roomie's voice: a sunlit kitchen corkboard, not a fintech dashboard.
// Warm linen canvas, espresso ink, terracotta accent, oat cards. One serif
// (Fraunces) for "home" moments, a rounded body face (Nunito) for everything
// else. Few words, soft shapes, zero shame.
export const Roomie = {
  canvas: '#FBF7F0', // warm linen — every screen's background
  card: '#F4EDE1', // oat — cards and soft surfaces
  ink: '#2D261F', // espresso — primary text
  sub: '#97897A', // warm gray — secondary text, labels
  hairline: '#EADFCE', // soft borders
  accent: '#C56C45', // terracotta — primary buttons, selected chips
  onAccent: '#FFF9F2', // text on terracotta
  sage: '#6F7F5E', // settled / gentle positive
  sageSoft: '#E9EDE2', // sage wash for "all settled" moments
  danger: '#B5543B', // warm clay red — errors, sign out
  input: '#FFFDF9', // input fill, a touch lighter than canvas
} as const;

export const RoomieFonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
} as const;

export const Colors = {
  light: {
    text: Roomie.ink,
    background: Roomie.canvas,
    backgroundElement: Roomie.card,
    backgroundSelected: Roomie.hairline,
    textSecondary: Roomie.sub,
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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
