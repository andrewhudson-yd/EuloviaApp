import * as Application from 'expo-application';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useApp, useQueue } from '../src/ui/AppState';
import { Button, Card, Icon, Screen } from '../src/ui/components';
import { type } from '../src/ui/theme';

export default function Settings() {
    const { profile, api, unpair } = useApp();
    const queue = useQueue();
    const [disconnecting, setDisconnecting] = useState(false);

    async function disconnect() {
        setDisconnecting(true);
        try {
            await unpair();
            router.replace('/pair');
        } catch {
            Alert.alert('Could not disconnect', 'Check your internet connection and try again. You can also disconnect this phone from Companion settings on the website.');
        } finally {
            setDisconnecting(false);
        }
    }

    function confirmUnpair() {
        const waiting = queue.jobs.filter((j) => j.type === 'file').length;
        Alert.alert(
            'Disconnect this phone?',
            waiting ? `${waiting} recording ${waiting === 1 ? 'file has' : 'files have'} not uploaded yet. They stay on the phone and upload if you pair it again.` : 'You can pair it again at any time.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: () => void disconnect() },
            ],
        );
    }

    return (
        <Screen navigation="settings">
            <Text style={type.title} accessibilityRole="header">Settings</Text>
            <Card>
                <Icon name="folder" size={30} />
                <Text style={type.heading}>{profile?.practice.name ?? 'Your practice'}</Text>
                <Text style={type.body}>Signed in as {profile?.user.name ?? '…'}</Text>
                <Text style={type.small}>This phone: {profile?.device.name ?? '…'}</Text>
                <Text style={type.small}>Server: {api?.server ?? '—'}</Text>
            </Card>
            <Button label="Uploads" variant="secondary" onPress={() => router.push('/uploads')} />
            <Button label="Disconnect this phone" variant="ghost" busy={disconnecting} disabled={disconnecting} onPress={confirmUnpair} />
            <Text style={type.small}>Version {Application.nativeApplicationVersion ?? '1.0.0'}. Recordings are stored privately on this phone only until they have uploaded.</Text>
        </Screen>
    );
}
