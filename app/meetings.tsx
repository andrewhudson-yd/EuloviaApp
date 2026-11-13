import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiaryMonth } from '../src/core/types';
import { expoStore } from '../src/platform/files';
import { useApp } from '../src/ui/AppState';
import { BottomNav, Card, Icon, Notice } from '../src/ui/components';
import { colours, font, space, type } from '../src/ui/theme';

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export default function Diary() {
    const { api, profile } = useApp();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: profile?.practice.timezone }).format(new Date());
    const [selected, setSelected] = useState<string | null>(null);
    const [result, setResult] = useState<{ key: string; data: DiaryMonth | null; error?: string } | null>(null);
    const [refresh, setRefresh] = useState(0);
    const date = selected ?? today;
    const month = date.slice(0, 7);
    const deviceId = profile?.device.id;
    const cacheKey = `diary-${deviceId}-${month}`;
    const requestKey = `${cacheKey}-${refresh}`;

    useFocusEffect(useCallback(() => {
        const client = api;
        if (!client) return;
        let active = true;

        const load = async () => {
            const cached = deviceId
                ? await expoStore.get(cacheKey).then(raw => raw ? JSON.parse(raw) as DiaryMonth : null).catch(() => null)
                : null;
            if (active && cached) setResult({ key: requestKey, data: cached });
            try {
                const data = await client.diary(month);
                if (!active) return;
                if (deviceId) await expoStore.set(cacheKey, JSON.stringify(data)).catch(() => {});
                if (active) setResult({ key: requestKey, data });
            } catch {
                if (active) setResult({
                    key: requestKey,
                    data: cached,
                    error: cached ? 'Could not refresh. Showing the appointments saved on this phone.' : 'The diary could not be loaded. Pull down to retry.',
                });
            }
        };

        void load();
        return () => { active = false; };
    }, [api, cacheKey, deviceId, month, requestKey]));

    const first = new Date(`${month}-01T12:00:00Z`);
    const monthLabel = first.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    const leading = (first.getUTCDay() + 6) % 7;
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    const days = last.getUTCDate();
    const monthResult = result?.key === requestKey ? result : null;
    const data = monthResult?.data;
    const hasEvent = (day: string) => data?.events.some(event => event.local_date <= day && event.end_date >= day) ?? false;
    const agenda = data?.events.filter(event => event.local_date <= date && event.end_date >= date);

    function changeMonth(offset: number) {
        const next = new Date(first);
        next.setUTCMonth(next.getUTCMonth() + offset);
        const nextMonth = next.toISOString().slice(0, 7);
        setSelected(nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`);
    }

    return (
        <View style={styles.screen}>
            <SafeAreaView edges={['left', 'right']} style={styles.screen}>
                <ScrollView contentContainerStyle={styles.content}
                    refreshControl={<RefreshControl refreshing={!monthResult && refresh > 0} onRefresh={() => setRefresh(value => value + 1)} tintColor={colours.sage} />}>
                    <View style={styles.header}>
                        <Text accessibilityRole="header" style={type.title}>Diary</Text>
                        <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.today}><Text style={styles.controlLabel}>Today</Text></Pressable>
                    </View>
                    <Card style={styles.calendar}>
                        <View style={styles.header}>
                            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.arrow}>
                                <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="arrow" size={20} /></View>
                            </Pressable>
                            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={type.heading}>{monthLabel}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.arrow}><Icon name="arrow" size={20} /></Pressable>
                        </View>
                        <View style={styles.week}>
                            {weekdayLabels.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
                        </View>
                        {Array.from({ length: Math.ceil((leading + days) / 7) }, (_, week) => (
                            <View key={week} style={styles.week}>
                                {Array.from({ length: 7 }, (_, column) => {
                                    const day = week * 7 + column - leading + 1;
                                    if (day < 1 || day > days) return <View key={column} style={styles.cell} />;
                                    const key = `${month}-${String(day).padStart(2, '0')}`;
                                    const active = date === key;
                                    const booked = hasEvent(key);
                                    return (
                                        <Pressable key={column} accessibilityRole="button" accessibilityState={{ selected: active }}
                                            accessibilityLabel={`${dateLabel(key)}${key === today ? ', today' : ''}${booked ? ', appointments' : ''}`}
                                            onPress={() => setSelected(key)} style={styles.cell}>
                                            <View style={[styles.day, key === today && styles.currentDay, active && styles.selectedDay]}>
                                                <Text style={[styles.dayNumber, active && styles.selectedNumber]}>{day}</Text>
                                                <View style={[styles.dot, booked && { backgroundColor: active ? colours.ivory : colours.sage }]} />
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        ))}
                    </Card>
                    <Text accessibilityRole="header" style={type.heading}>{dateLabel(date)}</Text>
                    {monthResult?.error && <Notice tone={data ? 'warning' : 'error'}>{monthResult.error}</Notice>}
                    {!monthResult && <Text style={type.small}>Loading appointments…</Text>}
                    {agenda?.length === 0 && <Notice>No appointments for this day.</Notice>}
                    {agenda?.map(event => {
                        const meetingId = event.meeting_id;
                        const meeting = data?.meetings.find(item => item.id === meetingId);
                        const card = (
                            <Card style={styles.event}>
                                <Icon name="calendar" size={23} />
                                <View style={styles.eventDetails}>
                                    <Text style={type.small}>{event.local_time && event.local_date === date ? `${event.local_time} · ` : ''}{event.type_label}</Text>
                                    <Text style={type.heading}>{meeting?.funeral.name ?? event.title}</Text>
                                    {event.location && <Text style={type.small}>{event.location}</Text>}
                                    {meeting?.recordings[0] && <Text style={type.small}>{meeting.recordings[0].status_label}</Text>}
                                </View>
                                {meetingId && <Icon name="arrow" size={18} />}
                            </Card>
                        );
                        return meetingId
                            ? <Pressable key={event.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: meetingId, month } })}>{card}</Pressable>
                            : <View key={event.id}>{card}</View>;
                    })}
                </ScrollView>
            </SafeAreaView>
            <BottomNav active="meetings" />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colours.ivory },
    content: { padding: space.l, gap: space.m, width: '100%', maxWidth: 680, alignSelf: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
    today: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.l, borderRadius: 24, backgroundColor: colours.sageTint },
    controlLabel: { ...type.small, fontFamily: font.semibold, color: colours.sageDark },
    calendar: { padding: space.s, gap: space.xs },
    arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    week: { flexDirection: 'row' },
    weekday: { ...type.small, flex: 1, fontSize: 11, textAlign: 'center' },
    cell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    day: { width: '92%', maxWidth: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: 'transparent' },
    currentDay: { borderColor: colours.sage },
    selectedDay: { backgroundColor: colours.sage },
    dayNumber: { ...type.small, color: colours.charcoal, fontFamily: font.semibold },
    selectedNumber: { color: colours.ivory },
    dot: { width: 4, height: 4, borderRadius: 2 },
    event: { flexDirection: 'row', alignItems: 'center', padding: space.l },
    eventDetails: { flex: 1 },
});
