import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../src/ui/AppState';
import { colours } from '../src/ui/theme';
import { Brand } from '../src/ui/components';

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
                        headerTitle: () => <Brand />,
                        contentStyle: { backgroundColor: colours.ivory },
                    }}
                >
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="pair" options={{ title: 'Connect to your practice', headerBackVisible: false }} />
                    <Stack.Screen name="meetings" options={{ title: 'Your meetings', headerBackVisible: false }} />
                    <Stack.Screen name="meeting/[id]" options={{ title: 'Before you record' }} />
                    <Stack.Screen name="record/[id]" options={{ title: 'Recording', headerBackVisible: false, gestureEnabled: false }} />
                    <Stack.Screen name="uploads" options={{ title: 'Uploads', headerBackVisible: false }} />
                    <Stack.Screen name="settings" options={{ title: 'Settings', headerBackVisible: false }} />
                </Stack>
            </AppStateProvider>
        </SafeAreaProvider>
    );
}
