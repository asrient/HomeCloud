import { StatusBar, StatusBarStyle } from 'expo-status-bar';
import { Platform } from 'react-native';

export function UIStatusBar({ type }: { type: 'page' | 'sheet' }) {
    let style: StatusBarStyle = 'auto';
    if (type === 'sheet') {
        style = Platform.OS === 'ios' ? 'light' : 'auto';
    }
    return <StatusBar style={style} />;
}
