import { Alert, Text, View } from 'react-native';
import type { FileJob, Job } from '../src/core/uploadQueue';
import { megabytes } from '../src/core/time';
import { useApp, useQueue } from '../src/ui/AppState';
import { Button, Card, Notice, Screen } from '../src/ui/components';
import { colours, space, type } from '../src/ui/theme';

const describe = (j: Job) => {
    if (j.type === 'finish') return 'Telling the server the recording is complete';
    if (j.type === 'marker') return 'A moment you marked';
    const f = j as FileJob & Job;
    const what = f.kind === 'intro' ? `Introduction ${f.position}` : `Part ${f.position}`;
    const progress = f.size ? ` · ${megabytes(f.sentBytes ?? 0)} of ${megabytes(f.size)}` : '';
    return `${what}${progress}`;
};

export default function Uploads() {
    const { queue } = useApp();
    const snapshot = useQueue();
    const byRecording = new Map<string, Job[]>();
    for (const j of snapshot.jobs) byRecording.set(j.recordingId, [...(byRecording.get(j.recordingId) ?? []), j]);

    function discard(recordingId: string, label: string) {
        Alert.alert('Discard these uploads?', `What has not uploaded yet for ${label} will be deleted from this phone. It cannot be recovered.`, [
            { text: 'Keep', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: () => void queue.discard(recordingId) },
        ]);
    }

    return (
        <Screen>
            {snapshot.blocked === 'unpaired' && <Notice tone="error">This phone is no longer connected. Pair it again; nothing waiting here has been lost.</Notice>}
            {snapshot.jobs.length === 0 ? (
                <Notice>Everything has been uploaded. Review the transcript and suggested notes on your computer — it can take a few minutes.</Notice>
            ) : (
                <Text style={type.body}>Recordings are kept on this phone until the server confirms it has them. You can close the app; uploads continue next time it is open.</Text>
            )}
            {[...byRecording.entries()].map(([recordingId, jobs]) => (
                <Card key={recordingId}>
                    <Text style={type.heading}>{jobs[0]!.meetingLabel}</Text>
                    {jobs.map((j) => (
                        <View key={j.id} style={{ gap: space.xs }}>
                            <Text style={type.body}>{describe(j)}</Text>
                            <Text style={[type.small, j.status === 'failed' && { color: colours.attention }]}>
                                {j.status === 'sending' ? 'Sending…' : j.status === 'failed' ? `Stopped: ${j.lastError ?? 'error'}` : j.attempts ? `Waiting to retry (${j.lastError ?? 'no connection'})` : 'Waiting'}
                            </Text>
                        </View>
                    ))}
                    {jobs.some((j) => j.status === 'failed') && <Button label="Discard" variant="ghost" onPress={() => discard(recordingId, jobs[0]!.meetingLabel)} />}
                </Card>
            ))}
            {snapshot.jobs.length > 0 && <Button label={snapshot.running ? 'Uploading…' : 'Try again now'} variant="secondary" busy={snapshot.running && snapshot.jobs.some((j) => j.status === 'sending')} onPress={() => void queue.retryAll().then(() => queue.run())} />}
        </Screen>
    );
}
