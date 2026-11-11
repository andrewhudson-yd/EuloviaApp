import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colours, space, type } from './theme';

const iconAssets = {
    calendar: require('../../assets/icons/calendar.png'), mic: require('../../assets/icons/mic.png'),
    upload: require('../../assets/icons/upload.png'), settings: require('../../assets/icons/settings.png'),
    check: require('../../assets/icons/check.png'), arrow: require('../../assets/icons/arrow.png'),
    pause: require('../../assets/icons/pause.png'), stop: require('../../assets/icons/stop.png'),
    clock: require('../../assets/icons/clock.png'), link: require('../../assets/icons/link.png'),
    wifi: require('../../assets/icons/wifi.png'), folder: require('../../assets/icons/folder.png'),
};
export type IconName = keyof typeof iconAssets;
export function Icon({ name, size = 24, colour = colours.sage }: { name: IconName; size?: number; colour?: string }) {
    return <Image source={iconAssets[name]} style={{ width: size, height: size, tintColor: colour }} accessible={false} />;
}

export function Brand({ light = false }: { light?: boolean }) {
    return (
        <View style={styles.brand} accessibilityLabel="Eulovia" accessible>
            <View style={styles.brandTile}>
                <Image source={require('../../assets/eulovia-mark.png')} style={styles.brandMark} accessible={false} />
            </View>
            <Text style={[styles.wordmark, light && { color: colours.ivory }]}>Eulovia</Text>
        </View>
    );
}

type Tab = 'meetings' | 'uploads' | 'settings';
export function BottomNav({ active }: { active: Tab }) {
    const insets = useSafeAreaInsets();
    const tabs: Array<{ key: Tab; label: string; icon: IconName }> = [
        { key: 'meetings', label: 'Meetings', icon: 'calendar' },
        { key: 'uploads', label: 'Uploads', icon: 'upload' },
        { key: 'settings', label: 'Settings', icon: 'settings' },
    ];
    return (
        <View accessibilityRole="tablist" style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {tabs.map(tab => (
                <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active === tab.key }}
                    onPress={() => { if (active !== tab.key) router.replace(`/${tab.key}`); }}
                    style={({ pressed }) => [styles.navItem, active === tab.key && styles.navActive, pressed && { opacity: 0.7 }]}>
                    <Icon name={tab.icon} size={23} colour={active === tab.key ? colours.sage : colours.muted} />
                    <Text style={[styles.navLabel, active === tab.key && { color: colours.sage, fontWeight: '600' }]}>{tab.label}</Text>
                </Pressable>
            ))}
        </View>
    );
}

export function Screen({ children, scroll = true, navigation, dark = false }: { children: ReactNode; scroll?: boolean; navigation?: Tab; dark?: boolean }) {
    return (
        <View style={[styles.screen, dark && { backgroundColor: colours.sageDark }]}>
            <SafeAreaView edges={navigation ? ['left', 'right'] : ['bottom', 'left', 'right']} style={{ flex: 1 }}>
                {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
            </SafeAreaView>
            {navigation && <BottomNav active={navigation} />}
        </View>
    );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled, busy, accessibilityHint, icon }: {
    label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'light' | 'outlineLight'; disabled?: boolean; busy?: boolean; accessibilityHint?: string; icon?: IconName;
}) {
    const v = buttonStyles[variant];
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress}
            style={({ pressed }) => [styles.button, v.box, (disabled || busy) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
            {busy ? <ActivityIndicator color={v.text.color} /> : <>{icon && <Icon name={icon} size={20} colour={v.text.color} />}<Text style={[styles.buttonText, v.text]}>{label}</Text></>}
        </Pressable>
    );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error'; children: ReactNode }) {
    const t = { info: [colours.sageTint, colours.sageDark], warning: [colours.waitingTint, colours.waiting], error: [colours.attentionTint, colours.attention] }[tone];
    return (
        <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: t[0] }]}>
            <Text style={[type.small, { color: t[1] }]}>{children}</Text>
        </View>
    );
}

const buttonStyles = {
    primary: StyleSheet.create({ box: { backgroundColor: colours.sage }, text: { color: '#fff' } }),
    secondary: StyleSheet.create({ box: { backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.sage }, text: { color: colours.sage } }),
    danger: StyleSheet.create({ box: { backgroundColor: colours.recording }, text: { color: '#fff' } }),
    ghost: StyleSheet.create({ box: { backgroundColor: 'transparent' }, text: { color: colours.sage } }),
    light: StyleSheet.create({ box: { backgroundColor: colours.ivory }, text: { color: colours.sageDark } }),
    outlineLight: StyleSheet.create({ box: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colours.stone }, text: { color: colours.ivory } }),
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colours.ivory },
    content: { padding: space.xl, gap: space.xl, width: '100%', maxWidth: 680, alignSelf: 'center' },
    card: { backgroundColor: colours.surface, borderRadius: 20, borderWidth: 1, borderColor: colours.line, padding: 22, gap: space.m, shadowColor: colours.sageDark, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    button: { minHeight: 54, borderRadius: 100, paddingHorizontal: space.xl, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
    buttonText: { fontSize: 16, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
    notice: { borderRadius: 16, padding: space.l },
    brand: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    brandTile: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colours.gold, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    brandMark: { width: 28, height: 28 },
    wordmark: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 27, letterSpacing: -0.7, color: colours.sage },
    navigation: { flexDirection: 'row', paddingTop: 10, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: colours.line, backgroundColor: colours.ivory },
    navItem: { flex: 1, minHeight: 54, gap: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
    navActive: { backgroundColor: colours.sageTint },
    navLabel: { fontSize: 10, color: colours.muted },
});
