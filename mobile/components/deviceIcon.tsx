import { Image } from 'expo-image';

export default function DeviceIcon({
    size,
    iconKey,
}: {
    size: number;
    iconKey: string | null;
}) {
    iconKey = iconKey || 'pc';
    // compat: replace - with _
    iconKey = iconKey.replace(/-/g, '_');
    return <Image source={{ uri: iconKey }} 
    contentFit='contain'
    style={{ width: size, height: size }} />;
}
