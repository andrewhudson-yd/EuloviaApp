import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colours, space, type } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
            {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
        </SafeAreaView>
    );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ label, onPress, variant = 'primary', disabled, busy, accessibilityHint }: {
    label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; busy?: boolean; accessibilityHint?: string;
}) {
    const v = buttonStyles[variant];
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
            disabled={disabled || busy}
            onPress={onPress}
            style={({ pressed }) => [styles.button, v.box, (disabled || busy) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}
        >
            {busy ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{label}</Text>}
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
    secondary: StyleSheet.create({ box: { backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line }, text: { color: colours.charcoal } }),
    danger: StyleSheet.create({ box: { backgroundColor: colours.recording }, text: { color: '#fff' } }),
    ghost: StyleSheet.create({ box: { backgroundColor: 'transparent' }, text: { color: colours.sage } }),
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colours.ivory },
    content: { padding: space.l, gap: space.l },
    card: { backgroundColor: colours.surface, borderRadius: 12, borderWidth: 1, borderColor: colours.line, padding: space.l, gap: space.m },
    button: { minHeight: 52, borderRadius: 10, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center' },
    buttonText: { fontSize: 17, fontWeight: '600' },
    notice: { borderRadius: 10, padding: space.m },
});
