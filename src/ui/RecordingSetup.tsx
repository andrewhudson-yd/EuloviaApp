import { requestRecordingPermissionsAsync } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { consentScript, SHORT_CONSENT_SCRIPT_VERSION } from '../core/consent';
import type { MeetingItem, ServiceItem } from '../core/types';
import { expoStore } from '../platform/files';
import { useApp } from './AppState';
import { Button, Card, Notice, Screen } from './components';
import { colours, space, type } from './theme';

export default function RecordingSetup() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const { api, profile } = useApp();
    const [meeting, setMeeting] = useState<MeetingItem | null>(null);
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [service, setService] = useState<ServiceItem | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [names, setNames] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [showScript, setShowScript] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const starting = useRef(false);

    useEffect(() => {
        if (!id && !api) return;
        let active = true;
        setLoading(true);
        setError(null);
        async function load() {
            try {
                if (id) {
                    const raw = await expoStore.get('meetings');
                    const item = (JSON.parse(raw ?? '[]') as MeetingItem[]).find((entry) => entry.id === id);
                    if (!item) throw new Error('This meeting is unavailable. Go back and refresh your meetings.');
                    if (active) setMeeting(item);
                } else if (api) {
                    const list = await api.services();
                    if (active) setServices(list);
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : 'Could not load recording details.');
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [api, id, attempt]);

    const attendeeNames = names.split(/[,\n]/).map((name) => name.trim()).filter(Boolean);
    const canStart = confirmed && attendeeNames.length > 0 && attendeeNames.length <= 20
        && attendeeNames.every((name) => name.length <= 100);
    const target = meeting?.funeral ?? service;

    function selectService(item: ServiceItem | null) {
        setService(item);
        setConfirmed(false);
        setError(null);
    }

    async function start() {
        if (!api || !target || starting.current || !canStart) return;
        starting.current = true;
        setBusy(true);
        setError(null);
        try {
            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
                setError('Allow microphone access in your phone settings to record.');
                return;
            }
            const attendees = attendeeNames.map((name) => ({
                name,
                relationship: meeting?.family.find((person) => person.name === name)?.relationship ?? null,
                agreed: true,
            }));
            const startedAt = new Date().toISOString();
            const recording = meeting
                ? await api.startRecording(meeting.id, attendees, startedAt, SHORT_CONSENT_SCRIPT_VERSION)
                : await api.startServiceRecording(target.id, attendees, startedAt, SHORT_CONSENT_SCRIPT_VERSION);
            router.replace({ pathname: '/record/[id]', params: { id: recording.id, label: target.name ?? 'Recording' } });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not start recording.');
        } finally {
            starting.current = false;
            setBusy(false);
        }
    }

    if (profile?.companion.enabled === false) {
        return <Screen><Notice tone="warning">Recording is switched off for your practice.</Notice></Screen>;
    }
    if (loading) return <Screen><Text style={type.body}>{id ? 'Loading meeting…' : 'Loading services…'}</Text></Screen>;
    if (!target) {
        const matchingServices = services.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
        return (
            <Screen>
                <Text accessibilityRole="header" style={type.title}>Choose a service</Text>
                {error ? (
                    <><Notice tone="error">{error}</Notice><Button label="Try again" onPress={() => setAttempt(attempt + 1)} /></>
                ) : services.length === 0 ? (
                    <Notice>No services available. Add a service in Eulovia first.</Notice>
                ) : (
                    <>
                        <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search by name" accessibilityLabel="Search services by name" />
                        {matchingServices.length === 0 && <Notice>No matching services.</Notice>}
                        {matchingServices.map((item) => (
                            <Pressable key={item.id} accessibilityRole="button" onPress={() => selectService(item)}>
                                <Card>
                                    <Text style={type.heading}>{item.name}</Text>
                                    {item.service_date && <Text style={type.small}>{formatDate(item.service_date)}</Text>}
                                </Card>
                            </Pressable>
                        ))}
                    </>
                )}
            </Screen>
        );
    }

    return (
        <Screen>
            <Text style={type.title} accessibilityRole="header">Before you record</Text>
            <View style={{ gap: space.xs }}>
                <Text style={type.heading}>{target.name ?? 'Family meeting'}</Text>
                {meeting && <Text style={type.small}>
                    {formatDate(meeting.local_date)}{meeting.local_time ? `, ${meeting.local_time}` : ''}
                    {meeting.location ? ` · ${meeting.location}` : ''}
                </Text>}
                {service && <Button label="Change service" variant="secondary" disabled={busy} onPress={() => selectService(null)} />}
            </View>
            {meeting && meeting.recordings.length > 0 && (
                <Notice>Latest recording: {meeting.recordings[0]!.status_label}. Review it in the web app.</Notice>
            )}
            <Text style={type.body}>May I record and transcribe this conversation to help write the ceremony? You can ask me to stop at any time.</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showScript }} onPress={() => setShowScript(!showScript)}>
                <Text style={[type.body, { color: colours.sage }]}>{showScript ? 'Hide full consent wording' : 'Read full consent wording'}</Text>
            </Pressable>
            {showScript && <Card><Text style={type.body}>{consentScript(profile?.practice.name ?? 'your celebrant')}</Text></Card>}
            <TextInput
                style={styles.input}
                value={names}
                onChangeText={(value) => { setNames(value); setConfirmed(false); }}
                editable={!busy}
                placeholder="Names of everyone present"
                accessibilityLabel="Names of everyone present, separated by commas"
                multiline
            />
            <Text style={type.small}>Separate names with commas.</Text>
            {attendeeNames.length > 20 && <Notice tone="warning">Enter up to 20 names.</Notice>}
            {attendeeNames.some((name) => name.length > 100) && <Notice tone="warning">Each name must be 100 characters or fewer.</Notice>}
            <View style={styles.confirmation}>
                <Switch accessibilityLabel="Everyone present agrees to be recorded" value={confirmed} onValueChange={setConfirmed} disabled={busy} trackColor={{ true: colours.sage, false: colours.line }} />
                <Text style={[type.body, { flex: 1 }]}>Everyone present agrees to be recorded.</Text>
            </View>
            {error && <Notice tone="error">{error}</Notice>}
            <Button label="Start recording" icon="mic" onPress={start} busy={busy} disabled={!canStart || !api} />
            <Text style={type.small}>You need a connection to start. Uploads resume when you’re back online.</Text>
        </Screen>
    );
}

function formatDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
    confirmation: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.sageTint },
    input: { borderWidth: 1, borderColor: colours.line, borderRadius: 8, padding: space.m, fontSize: 17, backgroundColor: colours.surface },
});
