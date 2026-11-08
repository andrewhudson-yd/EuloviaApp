import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/ui/AppState';
import { colours } from '../src/ui/theme';

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <AppStateProvider>
                <StatusBar style="dark" />
                <Stack
                    screenOptions={{
                        headerStyle: { backgroundColor: colours.ivory },
                        headerTintColor: colours.sage,
                        headerTitleStyle: { color: colours.charcoal },
                        headerShadowVisible: false,
                        contentStyle: { backgroundColor: colours.ivory },
                    }}
                >
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="pair" options={{ title: 'Connect to your practice', headerBackVisible: false }} />
                    <Stack.Screen name="meetings" options={{ title: 'Family meetings', headerBackVisible: false }} />
                    <Stack.Screen name="meeting/[id]" options={{ title: 'Meeting' }} />
                    <Stack.Screen name="record/[id]" options={{ title: 'Recording', headerBackVisible: false, gestureEnabled: false }} />
                    <Stack.Screen name="uploads" options={{ title: 'Uploads' }} />
                    <Stack.Screen name="settings" options={{ title: 'Settings' }} />
                </Stack>
            </AppStateProvider>
        </SafeAreaProvider>
    );
}
