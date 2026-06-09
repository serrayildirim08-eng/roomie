import 'react-native-get-random-values'; // polyfill for InstantDB id generation — must be first

import { ClerkProvider, Show } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/features/auth/auth-screen';
import { InstantClerkBridge } from '@/features/auth/instant-clerk-bridge';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <InstantClerkBridge />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Signed out → the door. Signed in → the app (tabs). */}
        <Show when="signed-in">
          <AnimatedSplashOverlay />
          <AppTabs />
        </Show>
        <Show when="signed-out">
          <AuthScreen />
        </Show>
      </ThemeProvider>
    </ClerkProvider>
  );
}
