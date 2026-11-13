import { requestRecordingPermissionsAsync } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { consentScript, SHORT_CONSENT_SCRIPT_VERSION } from '../core/consent';
import type { DiaryMonth, MeetingItem, ServiceItem } from '../core/types';
import { expoStore } from '../platform/files';
import { useApp } from './AppState';
import { Button, Card, Notice, Screen } from './components';
import { colours, space, type } from './theme';

export default function RecordingSetup() {
    const { id, month } = useLocalSearchParams<{ id?: string; month?: string }>();
    const { api, profile } = useApp();
    const [meeting, setMeeting] = useState<MeetingItem | null>(null);
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [service, setService] = useState<ServiceItem | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [confirmed, setConfirmed] = useState(false);
    const [showScript, setShowScript] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const starting = useRef(false);

    useEffect(() => {
        if (!id && (!choosing || !api)) return;
        let active = true;
        setLoading(true);
        setLoadError(null);
        async function load() {
            try {
                if (id) {
                    const key = month && profile ? `diary-${profile.device.id}-${month}` : 'meetings';
                    const raw = await expoStore.get(key);
                    let items = month && profile
                        ? (JSON.parse(raw ?? '{"meetings":[]}') as DiaryMonth).meetings
                        : JSON.parse(raw ?? '[]') as MeetingItem[];
                    if (!items.some((entry) => entry.id === id) && api) {
                        items = month ? (await api.diary(month)).meetings : await api.meetings();
                    }
                    const item = items.find((entry) => entry.id === id);
                    if (!item) throw new Error('This meeting is unavailable. Go back and refresh the diary.');
                    if (active) setMeeting(item);
                } else if (api) {
                    const list = await api.services();
                    if (active) setServices(list);
                }
            } catch (e) {
                if (active) setLoadError(e instanceof Error ? e.message : 'Could not load recording details.');
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; };
    }, [api, choosing, id, month, profile?.device.id, attempt]);

    const target = meeting?.funeral ?? service;
    const consentLabel = meeting ? 'Everyone present agrees to be recorded.' : 'I have permission from anyone I’m recording.';

    function selectService(item: ServiceItem | null) {
        setService(item);
        setChoosing(false);
        setConfirmed(false);
        setError(null);
    }

    async function start() {
        if (!api || (id && !meeting) || starting.current || !confirmed) return;
        starting.current = true;
        setBusy(true);
        setError(null);
        try {
            const permission = await requestRecordingPermissionsAsync();
            if (!permission.granted) {
                setError('Allow microphone access in your phone settings to record.');
                return;
            }
            const startedAt = new Date().toISOString();
            const recording = meeting
                ? await api.startRecording(meeting.id, [], startedAt, SHORT_CONSENT_SCRIPT_VERSION)
                : service
                    ? await api.startServiceRecording(service.id, [], startedAt, SHORT_CONSENT_SCRIPT_VERSION)
                    : await api.startStandaloneRecording(startedAt, SHORT_CONSENT_SCRIPT_VERSION);
            router.replace({ pathname: '/record/[id]', params: { id: recording.id, label: target?.name ?? 'Recording' } });
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
    if (id && !meeting) {
        return <Screen>{loadError
            ? <><Notice tone="error">{loadError}</Notice><Button label="Try again" onPress={() => setAttempt(attempt + 1)} /></>
            : <Text style={type.body}>Loading meeting…</Text>}</Screen>;
    }
    if (choosing) {
        const matchingServices = services.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
        return (
            <Screen>
                <Text accessibilityRole="header" style={type.title}>Choose a service</Text>
                <Button label="Record without a service" variant="secondary" onPress={() => selectService(null)} />
                {loading ? <Text style={type.body}>Loading services…</Text> : loadError ? (
                    <><Notice tone="error">{loadError}</Notice><Button label="Try again" onPress={() => setAttempt(attempt + 1)} /></>
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
            <Text style={type.title} accessibilityRole="header">{meeting ? 'Before you record' : 'New recording'}</Text>
            <Card style={styles.bookingCard}>
                <View style={styles.bookingDetails}>
                    <Text style={styles.bookingLabel}>{meeting ? 'Family meeting' : 'Service (optional)'}</Text>
                    <Text style={styles.bookingName}>{target?.name ?? (meeting ? 'Family meeting' : 'No service selected')}</Text>
                    {meeting && <Text style={type.small}>
                        {formatDate(meeting.local_date)}{meeting.local_time ? `, ${meeting.local_time}` : ''}
                        {meeting.location ? ` · ${meeting.location}` : ''}
                    </Text>}
                    {service?.service_date && <Text style={type.small}>{formatDate(service.service_date)}</Text>}
                </View>
                {!meeting && (
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => { setLoading(true); setChoosing(true); }}
                        style={({ pressed }) => [styles.changeService, (pressed || busy) && styles.changeServiceMuted]}
                    >
                        <Text style={styles.changeServiceLabel}>{service ? 'Change service' : 'Choose service'}</Text>
                    </Pressable>
                )}
            </Card>
            {meeting && meeting.recordings.length > 0 && (
                <Notice>Latest recording: {meeting.recordings[0]!.status_label}. Review it in the web app.</Notice>
            )}
            {meeting && <Text style={type.body}>May I record and transcribe this conversation to help write the ceremony? You can ask me to stop at any time.</Text>}
            {meeting && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showScript }} onPress={() => setShowScript(!showScript)}>
                <Text style={[type.body, { color: colours.sage }]}>{showScript ? 'Hide full consent wording' : 'Read full consent wording'}</Text>
            </Pressable>}
            {meeting && showScript && <Card><Text style={type.body}>{consentScript(profile?.practice.name ?? 'your celebrant')}</Text></Card>}
            <View style={styles.confirmation}>
                <Switch accessibilityLabel={consentLabel} value={confirmed} onValueChange={setConfirmed} disabled={busy} trackColor={{ true: colours.sage, false: colours.line }} />
                <Text style={[type.body, { flex: 1 }]}>{consentLabel}</Text>
            </View>
            {error && <Notice tone="error">{error}</Notice>}
            <Button label="Start recording" icon="mic" onPress={start} busy={busy} disabled={!confirmed || !api} />
            <Text style={type.small}>You need a connection to start. Uploads resume when you’re back online.</Text>
        </Screen>
    );
}

function formatDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
    bookingCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: space.l, gap: space.s },
    bookingDetails: { flexGrow: 1, flexShrink: 1, flexBasis: 145, gap: space.xs },
    bookingLabel: { ...type.small, color: colours.sage, fontWeight: '600' },
    bookingName: { ...type.heading, fontSize: 23 },
    changeService: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.m, borderRadius: 22, backgroundColor: colours.sageTint },
    changeServiceLabel: { ...type.small, color: colours.sageDark, fontWeight: '600' },
    changeServiceMuted: { opacity: 0.6 },
    confirmation: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.sageTint },
    input: { borderWidth: 1, borderColor: colours.line, borderRadius: 8, padding: space.m, fontSize: 17, backgroundColor: colours.surface },
});
