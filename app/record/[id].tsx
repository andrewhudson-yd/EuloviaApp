import { useAudioRecorder } from 'expo-audio';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { RecordingSession } from '../../src/core/recordingSession';
import { clock } from '../../src/core/time';
import { disableRecordingAudioMode, enableRecordingAudioMode, expoRecorder, SPEECH_RECORDING } from '../../src/platform/recorder';
import { useApp } from '../../src/ui/AppState';
import { Button, Card, Notice, Screen } from '../../src/ui/components';
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
    const meetingLabel = label ?? 'Family meeting';

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
            const partMs = (profile?.companion.part_minutes ?? 30) * 60_000;
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
        <Screen>
            <Text accessibilityRole="header" style={type.title}>{meetingLabel}</Text>
            <Card style={styles.card}>
                <Text style={type.heading}>{status[phase]}</Text>
                <Text style={styles.clock} accessibilityLabel={`Recorded ${clock(elapsed)}`}>{clock(elapsed)}</Text>
                {phase === 'recording' && !paused && !interrupted && <Text style={type.small}>You can lock your phone while recording.</Text>}
            </Card>
            {interrupted && phase === 'recording' && <Notice tone="warning">The microphone was interrupted. Resume when you’re ready.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            {phase === 'startFailed' && <Button label="Try microphone again" onPress={() => void begin()} />}
            {phase === 'recording' && (
                <View style={styles.actions}>
                    <Button label={paused || interrupted ? 'Resume' : 'Pause'} variant="secondary" onPress={togglePause} />
                    <Button label="Finish recording" variant="danger" onPress={confirmStop} />
                </View>
            )}
            {phase === 'saveFailed' && <Button label="Try saving again" onPress={() => void save()} />}
        </Screen>
    );
}

const styles = StyleSheet.create({
    card: { alignItems: 'center', paddingVertical: space.xl },
    clock: { fontSize: 52, fontVariant: ['tabular-nums'], color: colours.charcoal },
    actions: { gap: space.m },
});
