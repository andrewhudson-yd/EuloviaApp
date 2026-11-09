import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/core/api';
import type { MeetingItem } from '../src/core/types';
import { expoStore } from '../src/platform/files';
import { useApp, useQueue } from '../src/ui/AppState';
import { BottomNav, Button, Icon, Notice } from '../src/ui/components';
import { colours, space, type } from '../src/ui/theme';

const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Meetings() {
    const { api, profile } = useApp();
    const queue = useQueue();
    const [meetings, setMeetings] = useState<MeetingItem[] | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [offline, setOffline] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!api) return;
        setRefreshing(true);
        setError(null);
        try {
            const list = await api.meetings();
            await expoStore.set('meetings', JSON.stringify(list));
            setMeetings(list);
            setOffline(false);
        } catch (e) {
            const offline = e instanceof ApiError && e.kind === 'network';
            const cached = await expoStore.get('meetings').then((raw) => raw ? JSON.parse(raw) as MeetingItem[] : null).catch(() => null);
            if (cached) setMeetings(cached);
            setOffline(offline && cached !== null);
            if (!cached || !offline) setError('Meetings could not be refreshed.');
        } finally {
            setRefreshing(false);
        }
    }, [api]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const today = new Date().toLocaleDateString('en-CA', { timeZone: profile?.practice.timezone });
    const groups: Array<[string, MeetingItem[]]> = [
        ['Today', (meetings ?? []).filter((m) => m.local_date === today)],
        ['Upcoming', (meetings ?? []).filter((m) => m.local_date > today)],
        ['Earlier', (meetings ?? []).filter((m) => m.local_date < today).reverse()],
    ];
    const pending = new Set(queue.jobs.map((job) => job.recordingId)).size;

    return (
        <View style={{ flex: 1, backgroundColor: colours.ivory }}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colours.sage} />}>
            {offline && <Notice tone="warning">No connection. Showing the meetings saved on this phone. Recordings will upload when you are back online.</Notice>}
            <View style={styles.intro}>
                <Text accessibilityRole="header" style={type.title}>Your meetings</Text>
                <Text style={type.body}>Be present. Capture what matters.</Text>
            </View>
            {profile && <View style={styles.practice}><Icon name="folder" /><View style={{ flex: 1 }}><Text style={type.heading}>{profile.practice.name}</Text><Text style={type.small}>Your celebrancy practice</Text></View></View>}
            {error && <Notice tone="error">{error}</Notice>}
            {pending > 0 && <Button
                label={`Uploads · ${pending} pending`}
                icon="upload"
                variant="secondary"
                onPress={() => router.push('/uploads')}
            />}
            {meetings === null && !error && <Text style={type.small}>Loading your meetings…</Text>}
            {meetings !== null && meetings.length === 0 && (
                <Notice>No family meetings in the last or next two weeks. Arrange one from the funeral’s page on your computer.</Notice>
            )}
            {groups.filter(([, list]) => list.length).map(([title, list]) => (
                <View key={title} style={{ gap: space.s }}>
                    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
                    {list.map((m) => (
                        <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: m.id } })} style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]}>
                            <View style={styles.meetingRow}><Icon name="calendar" size={25} /><View style={{ flex: 1, gap: 5 }}><Text style={type.heading}>{m.funeral.name ?? 'Family meeting'}</Text>
                            <Text style={type.small}>{dayLabel(m.local_date)}{m.local_time ? `, ${m.local_time}` : ''}</Text>
                            {m.location ? <Text style={type.small}>{m.location}</Text> : null}</View></View>
                            {m.recordings.length > 0 && <Text style={[type.small, { color: colours.sage }]}>Recorded · {m.recordings[0]!.status_label}</Text>}
                            <View style={styles.openMeeting}><Text style={{ color: colours.ivory, fontSize: 14, fontWeight: '600' }}>View meeting</Text><Icon name="arrow" size={16} colour={colours.ivory} /></View>
                        </Pressable>
                    ))}
                </View>
            ))}
        </ScrollView>
        <BottomNav active="meetings" />
        </View>
    );
}

const styles = StyleSheet.create({
    content: { padding: space.xl, gap: space.xl, width: '100%', maxWidth: 680, alignSelf: 'center' },
    intro: { gap: space.xs },
    groupTitle: { fontSize: 17, fontWeight: '600', color: colours.charcoal, marginBottom: 5 },
    item: { backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, borderRadius: 20, padding: 20, gap: space.m, marginBottom: 6, shadowColor: colours.sageDark, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    practice: { flexDirection: 'row', gap: 15, alignItems: 'center', borderWidth: 1, borderColor: colours.line, padding: 18, borderRadius: 18, backgroundColor: colours.surface },
    meetingRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    openMeeting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 100, backgroundColor: colours.sage, padding: 12 },
});
