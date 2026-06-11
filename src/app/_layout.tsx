import 'react-native-get-random-values'; // polyfill for InstantDB id generation — must be first

import { ClerkProvider, Show } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/features/auth/auth-screen';
import { InstantClerkBridge } from '@/features/auth/instant-clerk-bridge';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  if (!fontsLoaded) return null; // splash stays up until the app's voice is ready
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
