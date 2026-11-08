import { requestRecordingPermissionsAsync } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CONSENT_SCRIPT_VERSION, consentProblems, consentScript } from '../../src/core/consent';
import type { Attendee, MeetingItem } from '../../src/core/types';
import { expoStore } from '../../src/platform/files';
import { useApp } from '../../src/ui/AppState';
import { Button, Card, Notice, Screen } from '../../src/ui/components';
import { colours, space, type } from '../../src/ui/theme';

/** Nobody is recorded without agreeing. The server refuses to start a recording otherwise. */
export default function Meeting() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { api, profile } = useApp();
    const [meeting, setMeeting] = useState<MeetingItem | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [people, setPeople] = useState<Attendee[]>([]);
    const [extra, setExtra] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const starting = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void expoStore.get('meetings').then((raw) => {
            const m = (JSON.parse(raw ?? '[]') as MeetingItem[]).find((x) => x.id === id) ?? null;
            setMeeting(m);
            setLoaded(true);
            setPeople((m?.family ?? []).map((f) => ({ name: f.name, relationship: f.relationship, agreed: false })));
        }).catch(() => setLoaded(true));
    }, [id]);

    const present = people.filter((p) => p.name.trim() !== '');
    const problems = consentProblems(present, confirmed);

    async function start() {
        if (!api || !meeting || starting.current || problems.length || extra.trim()) return;
        starting.current = true;
        setBusy(true);
        setError(null);
        try {
            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
                setError('Allow microphone access in your phone settings to record this meeting.');
                return;
            }
            const recording = await api.startRecording(meeting.id, present, new Date().toISOString(), CONSENT_SCRIPT_VERSION);
            router.replace({ pathname: '/record/[id]', params: { id: recording.id, label: meeting.funeral.name ?? 'Meeting' } });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start.');
        } finally {
            starting.current = false;
            setBusy(false);
        }
    }

    if (!loaded) return <Screen><Text style={type.body}>Loading meeting…</Text></Screen>;
    if (!meeting) return <Screen><Notice tone="error">This meeting is unavailable. Go back and refresh your meetings.</Notice></Screen>;
    if (profile?.companion.enabled === false) {
        return <Screen><Notice tone="warning">Recording is switched off for your practice.</Notice></Screen>;
    }

    return (
        <Screen>
            <View style={{ gap: space.xs }}>
                <Text accessibilityRole="header" style={type.title}>{meeting.funeral.name ?? 'Family meeting'}</Text>
                <Text style={type.small}>
                    {new Date(`${meeting.local_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {meeting.local_time ? `, ${meeting.local_time}` : ''}{meeting.location ? ` · ${meeting.location}` : ''}
                </Text>
            </View>
            {meeting.recordings.length > 0 && (
                <Notice>Latest recording: {meeting.recordings[0]!.status_label}. Review recordings in the web app.</Notice>
            )}
            <Card>
                <Text style={type.heading}>Read this aloud</Text>
                <Text style={type.body}>{consentScript(profile?.practice.name ?? 'your celebrant')}</Text>
            </Card>

            <Card>
                <Text style={type.heading}>Who is here?</Text>
                <Text style={type.small}>Switch on each person once they have said yes. Remove anyone who is not here.</Text>
                {people.map((p, i) => (
                    <View key={`${p.name}-${i}`} style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={type.body}>{p.name}</Text>
                            {p.relationship ? <Text style={type.small}>{p.relationship}</Text> : null}
                        </View>
                        <Switch
                            accessibilityLabel={`${p.name} agrees to be recorded`}
                            value={p.agreed}
                            onValueChange={(v) => setPeople(people.map((x, j) => (j === i ? { ...x, agreed: v } : x)))}
                            trackColor={{ true: colours.sage, false: colours.line }}
                        />
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => setPeople(people.filter((_, j) => j !== i))} style={styles.remove}>
                            <Text style={{ color: colours.muted, fontSize: 20 }}>×</Text>
                        </Pressable>
                    </View>
                ))}
                <View style={styles.row}>
                    <TextInput style={styles.input} value={extra} onChangeText={setExtra} placeholder="Add someone else" accessibilityLabel="Name of someone else who is here" />
                    <Button label="Add" variant="secondary" disabled={extra.trim() === ''} onPress={() => { setPeople([...people, { name: extra.trim(), relationship: null, agreed: false }]); setExtra(''); }} />
                </View>
            </Card>

            <View style={styles.row}>
                <Switch accessibilityLabel="Everyone present has agreed to this meeting being recorded" value={confirmed} onValueChange={setConfirmed} trackColor={{ true: colours.sage, false: colours.line }} />
                <Text style={[type.body, { flex: 1 }]}>Everyone present has agreed to this meeting being recorded.</Text>
            </View>

            {problems.length > 0 && <Notice tone="warning">{problems.join('\n')}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <Button label="Start recording" variant="danger" onPress={start} busy={busy} disabled={problems.length > 0 || extra.trim() !== '' || !api} />
            <Text style={type.small}>You need a connection to start. Once started, recording carries on with the screen locked and uploads later if you go offline.</Text>
        </Screen>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
    remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, borderWidth: 1, borderColor: colours.line, borderRadius: 8, padding: space.m, fontSize: 17, backgroundColor: colours.surface },
});
