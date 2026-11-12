import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/ui/AppState';
import { colours, font } from '../src/ui/theme';
import { Brand } from '../src/ui/components';

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({ DMSerifDisplay_400Regular, Inter_400Regular, Inter_600SemiBold });
    if (!fontsLoaded && !fontError) return null;

    return (
        <SafeAreaProvider>
            <AppStateProvider>
                <StatusBar style="dark" />
                <Stack
                    screenOptions={{
                        headerStyle: { backgroundColor: colours.ivory },
                        headerTintColor: colours.sage,
                        headerTitleStyle: { color: colours.charcoal, fontFamily: font.display },
                        headerShadowVisible: false,
                        headerTitle: () => <Brand />,
                        contentStyle: { backgroundColor: colours.ivory },
                    }}
                >
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="pair" options={{ title: 'Connect to your practice', headerBackVisible: false }} />
                    <Stack.Screen name="meetings" options={{ title: 'Your meetings', headerBackVisible: false }} />
                    <Stack.Screen name="meeting/[id]" options={{ title: 'Before you record' }} />
                    <Stack.Screen name="new-recording" options={{ title: 'New recording' }} />
                    <Stack.Screen name="record/[id]" options={{ title: 'Recording', headerBackVisible: false, gestureEnabled: false }} />
                    <Stack.Screen name="uploads" options={{ title: 'Uploads', headerBackVisible: false }} />
                    <Stack.Screen name="settings" options={{ title: 'Settings', headerBackVisible: false }} />
                </Stack>
            </AppStateProvider>
        </SafeAreaProvider>
    );
}
