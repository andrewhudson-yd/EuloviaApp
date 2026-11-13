import { useAudioRecorder } from 'expo-audio';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { RecordingSession } from '../../src/core/recordingSession';
import { clock } from '../../src/core/time';
import { disableRecordingAudioMode, enableRecordingAudioMode, expoRecorder, SPEECH_RECORDING } from '../../src/platform/recorder';
import { useApp } from '../../src/ui/AppState';
import { Button, Icon, Notice, Screen } from '../../src/ui/components';
import { colours, space, type } from '../../src/ui/theme';

type Phase = 'starting' | 'startFailed' | 'recording' | 'saving' | 'saveFailed' | 'saved';

export default function Record() {
    const { id, label } = useLocalSearchParams<{ id: string; label?: string }>();
    const { queue, profile } = useApp();
    const recorder = useAudioRecorder(SPEECH_RECORDING);
    const session = useRef<RecordingSession | null>(null);
    const started = useRef(false);
    const saving = useRef(false);
    const [phase, setPhase] = useState<Phase>('starting');
    const [paused, setPaused] = useState(false);
    const [interrupted, setInterrupted] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const meetingLabel = label ?? 'Recording';

    usePreventRemove(phase === 'starting' || phase === 'recording' || phase === 'saving' || phase === 'saveFailed', () => {
        Alert.alert('Recording in progress', 'Save the recording before leaving this screen.');
    });

    async function begin() {
        if (started.current) return;
        started.current = true;
        setPhase('starting');
        setError(null);
        try {
            await enableRecordingAudioMode();
            const partMs = Math.min(profile?.companion.part_minutes ?? 20, 20) * 60_000;
            const recording = new RecordingSession(id, expoRecorder(recorder), partMs, async (part) => {
                await queue.addFile({ recordingId: id, meetingLabel, kind: 'part', position: part.position, uri: part.uri, durationMs: part.durationMs, offsetMs: part.offsetMs });
                void queue.run();
            });
            await recording.begin();
            session.current = recording;
            setPhase('recording');
        } catch (e) {
            await disableRecordingAudioMode().catch(() => {});
            started.current = false;
            setError(e instanceof Error ? e.message : 'The microphone could not start.');
            setPhase('startFailed');
        }
    }

    useEffect(() => {
        void begin();
    }, []);

    useEffect(() => {
        if (phase !== 'recording') return;
        let active = true;
        let checking = false;
        const timer = setInterval(async () => {
            const recording = session.current;
            if (!recording || checking || saving.current) return;
            checking = true;
            try {
                await recording.tick();
                if (!active || saving.current) return;
                setElapsed(recording.elapsedMs());
                setInterrupted(!recording.isPaused && !recorder.isRecording);
            } catch (e) {
                if (active && !saving.current) {
                    setError(e instanceof Error ? e.message : 'A recording part could not be saved.');
                }
            } finally {
                checking = false;
            }
        }, 1000);
        return () => { active = false; clearInterval(timer); };
    }, [phase, recorder]);

    function togglePause() {
        const recording = session.current;
        if (!recording || saving.current) return;
        try {
            if (recording.isPaused) recording.resume();
            else if (interrupted) recorder.record();
            else recording.pause();
            setPaused(recording.isPaused);
            setInterrupted(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The microphone could not be controlled.');
        }
    }

    async function save() {
        const recording = session.current;
        if (!recording || saving.current) return;
        saving.current = true;
        setPhase('saving');
        setError(null);
        try {
            const totals = await recording.stop();
            await queue.addFinish({ recordingId: id, meetingLabel, parts: totals.parts, durationMs: totals.durationMs, endedAt: new Date().toISOString() });
            await disableRecordingAudioMode().catch(() => {});
            void queue.run();
            setPhase('saved');
        } catch (e) {
            saving.current = false;
            setError(e instanceof Error ? e.message : 'The recording could not be saved.');
            setPhase('saveFailed');
        }
    }

    useEffect(() => {
        if (phase === 'saved') router.replace('/uploads');
    }, [phase]);

    function confirmStop() {
        Alert.alert('Finish recording?', 'Your recording will be queued for upload.', [
            { text: 'Keep recording', style: 'cancel' },
            { text: 'Finish', onPress: () => void save() },
        ]);
    }

    const status = {
        starting: 'Starting microphone…',
        startFailed: 'Microphone unavailable',
        recording: interrupted ? 'Interrupted' : paused ? 'Paused' : 'Recording',
        saving: 'Saving recording…',
        saveFailed: 'Recording needs to be saved',
        saved: 'Recording saved',
    };

    return (
        <Screen dark>
            <Stack.Screen options={{ headerTitle: 'Recording', headerStyle: { backgroundColor: colours.sageDark }, headerTintColor: colours.ivory, headerTitleStyle: { color: colours.ivory }, headerBackVisible: false }} />
            <StatusBar style="light" />
            <View style={styles.card}>
                <Image source={require('../../assets/eulovia-mark-light.png')} style={styles.brandMark} accessible={false} />
                <Text accessibilityRole="header" style={styles.meetingTitle}>{meetingLabel}</Text>
                <View style={styles.wave} accessible={false}>
                    {[10, 19, 30, 16, 40, 24, 52, 30, 14, 34, 48, 25, 58, 35, 18, 42, 30, 50, 22, 36, 16, 28, 12].map((height, index) => <View key={index} style={[styles.waveBar, { height, opacity: phase === 'recording' && !paused && !interrupted ? 1 : 0.35 }]} />)}
                </View>
                <Text style={styles.clock} accessibilityLabel={`Recorded ${clock(elapsed)}`}>{clock(elapsed)}</Text>
                <View style={styles.statusRow}><View style={[styles.dot, { backgroundColor: phase === 'recording' && !paused && !interrupted ? '#E7A89E' : colours.stone }]} /><Text style={styles.statusText}>{status[phase]}</Text></View>
            </View>
            {interrupted && phase === 'recording' && <Notice tone="warning">The microphone was interrupted. Resume when you’re ready.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            {phase === 'startFailed' && <Button label="Try microphone again" onPress={() => void begin()} />}
            {phase === 'startFailed' && <Button label="Back to diary" variant="outlineLight" onPress={() => router.replace('/meetings')} />}
            {phase === 'recording' && (
                <View style={styles.actions}>
                    <Button label={paused || interrupted ? 'Resume' : 'Pause'} icon={paused || interrupted ? 'mic' : 'pause'} variant="outlineLight" onPress={togglePause} />
                    <Button label="Finish recording" icon="stop" variant="light" onPress={confirmStop} />
                </View>
            )}
            {phase === 'saveFailed' && <Button label="Try saving again" variant="light" onPress={() => void save()} />}
            <View style={styles.localNote}><Icon name="mic" size={17} colour={colours.ivory} /><Text style={styles.note}>Recording files are saved on this phone.</Text></View>
            {phase === 'recording' && !paused && !interrupted && <Text style={[styles.note, { textAlign: 'center' }]}>You can lock your phone. Stay present in the conversation.</Text>}
        </Screen>
    );
}

const styles = StyleSheet.create({
    card: { alignItems: 'center', paddingVertical: space.xl, gap: 24 },
    clock: { fontSize: 52, fontWeight: '500', fontVariant: ['tabular-nums'], letterSpacing: -2, color: colours.ivory },
    actions: { gap: space.m },
    brandMark: { width: 55, height: 55 },
    meetingTitle: { fontSize: 23, fontWeight: '600', color: colours.ivory, textAlign: 'center', letterSpacing: -0.4 },
    wave: { height: 64, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    waveBar: { width: 3, borderRadius: 2, backgroundColor: colours.stone },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 13, color: colours.ivory },
    localNote: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    note: { fontSize: 12, lineHeight: 19, color: colours.ivory },
});
