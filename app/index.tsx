import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../src/ui/AppState';
import { colours } from '../src/ui/theme';

export default function Start() {
    const { status } = useApp();
    if (status === 'loading') {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.ivory }}>
                <ActivityIndicator color={colours.sage} accessibilityLabel="Loading" />
            </View>
        );
    }
    return <Redirect href={status === 'ready' ? '/meetings' : '/pair'} />;
}
