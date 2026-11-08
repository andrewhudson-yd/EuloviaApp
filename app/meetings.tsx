import { Link, router, useFocusEffect, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../src/core/api';
import type { MeetingItem } from '../src/core/types';
import { expoStore } from '../src/platform/files';
import { useApp, useQueue } from '../src/ui/AppState';
import { Button, Notice } from '../src/ui/components';
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
        ['Coming up', (meetings ?? []).filter((m) => m.local_date > today)],
        ['Earlier', (meetings ?? []).filter((m) => m.local_date < today).reverse()],
    ];
    const pending = new Set(queue.jobs.map((job) => job.recordingId)).size;

    return (
        <ScrollView style={{ backgroundColor: colours.ivory }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
            <Stack.Screen options={{ headerRight: () => <Link href="/settings" style={styles.headerLink}>Settings</Link> }} />
            {profile && <Text style={type.small}>{profile.practice.name}</Text>}
            {offline && <Notice tone="warning">No connection. Showing the meetings saved on this phone. Recordings will upload when you are back online.</Notice>}
            <View style={styles.intro}>
                <Text accessibilityRole="header" style={type.title}>Choose a meeting</Text>
                <Text style={type.body}>Open a family meeting to confirm consent and record.</Text>
            </View>
            {error && <Notice tone="error">{error}</Notice>}
            <Button
                label={pending ? `Uploads · ${pending} pending` : 'Uploads'}
                variant="secondary"
                onPress={() => router.push('/uploads')}
            />
            {meetings !== null && meetings.length === 0 && (
                <Notice>No family meetings in the last or next two weeks. Arrange one from the funeral’s page on your computer.</Notice>
            )}
            {groups.filter(([, list]) => list.length).map(([title, list]) => (
                <View key={title} style={{ gap: space.s }}>
                    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
                    {list.map((m) => (
                        <Pressable key={m.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: m.id } })} style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]}>
                            <Text style={type.heading}>{m.funeral.name ?? 'Funeral'}</Text>
                            <Text style={type.small}>{dayLabel(m.local_date)}{m.local_time ? `, ${m.local_time}` : ''}{m.location ? ` · ${m.location}` : ''}</Text>
                            {m.recordings.length > 0 && <Text style={[type.small, { color: colours.sage }]}>Recorded · {m.recordings[0]!.status_label}</Text>}
                        </Pressable>
                    ))}
                </View>
            ))}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { padding: space.l, gap: space.l },
    intro: { gap: space.xs },
    groupTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: colours.stoneInk },
    item: { backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, borderRadius: 12, padding: space.l, gap: space.xs },
    headerLink: { color: colours.sage, fontSize: 17 },
});
