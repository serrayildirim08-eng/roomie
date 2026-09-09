import 'react-native-get-random-values'; // polyfill for InstantDB id generation — must be first

import { ClerkProvider, Show } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
} from '@expo-google-fonts/baloo-2';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/features/auth/auth-screen';
import { InstantClerkBridge } from '@/features/auth/instant-clerk-bridge';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  if (!fontsLoaded) return null; // splash stays up until the app's voice is ready
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
