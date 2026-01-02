import { useDisks } from "@/hooks/useSystemState";
import { formatFileSize } from "@/lib/utils";
import { View, ActivityIndicator, FlatList, Pressable } from "react-native";
import { UIText } from "./ui/UIText";
import { useRouter } from 'expo-router';
import { getFolderAppRoute } from "@/lib/fileUtils";
import { UIIcon } from "./ui/UIIcon";
import { useThemeColor } from "@/hooks/useThemeColor";

export function DisksGrid({ deviceFingerprint }: { deviceFingerprint: string | null }) {
    const { disks, isLoading, error } = useDisks(deviceFingerprint);
    const router = useRouter();
    const textColor = useThemeColor({}, 'text');

    return (
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
            {
                (isLoading || error) &&
                <View style={{ alignItems: 'center', justifyContent: 'center', height: 100 }} >
                    {isLoading && <ActivityIndicator />}
                    {error && <UIText>Error loading disks: {error}</UIText>}
                </View>
            }
            <FlatList
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                data={disks}
                ListEmptyComponent={
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, height: '100%' }}>
                        <UIText>
                            No storage.
                        </UIText>
                    </View>
                }
                keyExtractor={(item) => item.path}
                renderItem={({ item }) => (
                    <Pressable
                        onPress={() => {
                            router.navigate(getFolderAppRoute(item.path, deviceFingerprint));
                        }}
                        style={{
                            padding: 10,
                            paddingHorizontal: 20,
                            height: '100%',
                            minWidth: 200,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                        }}>
                        <View style={{ alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <UIIcon name="externaldrive.fill" size={50} themeColor="icon" style={{ marginRight: 10 }} />
                        </View>
                        <View style={{ alignItems: 'flex-start', height: '100%', justifyContent: 'center' }}>
                            <UIText>{item.name}</UIText>
                            {/* Show a progress bar for disk usage */}
                            <View style={{
                                height: 6,
                                backgroundColor: textColor,
                                borderRadius: 5,
                                marginTop: 5,
                                width: '100%'
                            }}>
                                <View
                                    style={{
                                        width: `${((item.size - item.free) / item.size) * 100}%`,
                                        height: '100%',
                                        backgroundColor: 'orange',
                                        borderRadius: 5,
                                    }}
                                />
                            </View>
                            <View style={{ justifyContent: 'space-between', flexDirection: 'row', gap: 20 }} >
                                <UIText color='textSecondary' size='xs'>{formatFileSize(item.size)}</UIText>
                                <UIText color='textSecondary' size='xs'>{formatFileSize(item.free)} free</UIText>
                            </View>
                        </View>
                    </Pressable>
                )}
            />

        </View>
    );
}
