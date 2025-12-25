import { Image } from 'expo-image';

export default function DeviceIcon({
    size,
    iconKey,
}: {
    size: number;
    iconKey: string | null;
}) {
    return <Image source={{ uri: iconKey || 'pc' }} style={{ width: size, height: size }} />;
}
