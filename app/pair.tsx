import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { parsePairingLink } from '../src/core/pairing';
import { useApp } from '../src/ui/AppState';
import { Brand, Button, Card, Notice, Screen } from '../src/ui/components';
import { colours, space, type } from '../src/ui/theme';

/** Scan the QR code from Settings → Companion app, or type the server and code. */
export default function Pair() {
    const { pair, status } = useApp();
    // Opening the QR link with the phone's own camera arrives here as ?server=…&code=…
    const params = useLocalSearchParams<{ server?: string; code?: string }>();
    const [server, setServer] = useState(params.server ?? '');
    const [code, setCode] = useState(params.code ?? '');
    const [scanning, setScanning] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const handled = useRef(false);

    useEffect(() => {
        if (status === 'ready') router.replace('/meetings');
    }, [status]);

    async function connect(s = server, c = code) {
        setBusy(true);
        setError(null);
        try {
            await pair(s, c);
            router.replace('/meetings');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not connect.');
            handled.current = false;
        } finally {
            setBusy(false);
        }
    }

    async function startScanning() {
        if (!permission?.granted && !(await requestPermission()).granted) {
            setError('Allow the camera to scan the code, or type it in below.');
            return;
        }
        setScanning(true);
    }

    return (
        <Screen>
            <Brand />
            <View style={{ gap: space.s }}><Text accessibilityRole="header" style={type.title}>Be present. Capture what matters.</Text><Text style={type.small}>Connect your phone to your practice to begin.</Text></View>
            <Text style={type.body}>
                On your computer, open your account and go to Settings → Companion app → “Show a pairing code”. Then scan it here.
            </Text>
            {scanning ? (
                <View style={styles.cameraBox}>
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={({ data }) => {
                            if (handled.current) return;
                            const details = parsePairingLink(data);
                            if (!details) {
                                setError('That is not a Companion pairing code.');
                                return;
                            }
                            handled.current = true;
                            setScanning(false);
                            setServer(details.server);
                            setCode(details.code);
                            void connect(details.server, details.code);
                        }}
                    />
                </View>
            ) : (
                <Button label="Scan the pairing code" icon="link" onPress={startScanning} busy={busy} />
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <Card>
                <Text style={type.heading}>Or type it in</Text>
                <Text style={type.small}>Server address</Text>
                <TextInput style={styles.input} value={server} onChangeText={setServer} placeholder="practice.example.co.uk" autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Server address" />
                <Text style={type.small}>Pairing code</Text>
                <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} placeholder="ABCDE-FGHJK" autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Pairing code" />
                <Button label="Connect" variant="secondary" onPress={() => connect()} busy={busy} disabled={!server || code.replace(/[^A-Za-z0-9]/g, '').length < 10} />
            </Card>
            <Text style={type.small}>The code works once and expires after 10 minutes. Your password is never stored on this phone.</Text>
        </Screen>
    );
}

const styles = StyleSheet.create({
    brand: { flexDirection: 'row', alignItems: 'center', gap: space.m },
    logo: { width: 40, height: 40 },
    cameraBox: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
    input: { borderWidth: 1, borderColor: colours.line, borderRadius: 8, padding: space.m, fontSize: 17, color: colours.charcoal, backgroundColor: colours.surface },
    code: { fontSize: 22, letterSpacing: 3 },
});
