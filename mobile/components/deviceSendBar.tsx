import { PeerInfo } from "shared/types";
import { UIView } from "./ui/UIView";
import { UIButton } from "./ui/UIButton";
import { UITextInput } from "./ui/UITextInput";
import { UIContextMenu } from './ui/UIContextMenu';
import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { getServiceController } from "@/lib/utils";
import { useManagedLoading } from "@/hooks/useManagedLoading";
import { useSendAssets } from "@/hooks/useSendAssets";
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export type DeviceSendBarProps = {
    peerInfo: PeerInfo;
};

export function DeviceSendBar({ peerInfo }: DeviceSendBarProps) {
    const { withLoading, isActive } = useManagedLoading();
    const { sendAssets, isSending } = useSendAssets();
    const [text, setText] = useState('');

    const sendMessage = useCallback(async () => {
        if (text.trim().length === 0) return;
        const message = text.trim();
        setText('');
        await withLoading(async () => {
            const sc = await getServiceController(peerInfo.fingerprint);
            await sc.app.receiveContent(null, message, 'text');
        }, { title: 'Sending...', errorTitle: 'Could not send' });
    }, [text, peerInfo.fingerprint, withLoading]);

    const openDocPicker = useCallback(async () => {
        const result = await DocumentPicker.getDocumentAsync({
            multiple: true,
            copyToCacheDirectory: true,
        });
        if (result.canceled || result.assets.length === 0) return;
        await sendAssets(peerInfo.fingerprint, result.assets, {
            getPath: (a) => a.uri,
            label: 'files',
            deleteAfter: true,
        });
    }, [peerInfo.fingerprint, sendAssets]);

    const openImagePicker = useCallback(async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
        });
        if (result.canceled || result.assets.length === 0) return;
        await sendAssets(peerInfo.fingerprint, result.assets, {
            getPath: (a) => a.uri,
            label: 'photos',
        });
    }, [peerInfo.fingerprint, sendAssets]);

    return <>
        <UIView
            themeColor={Platform.OS === 'android' ? "backgroundTertiary" : "backgroundSecondary"}
            style={{
                width: '100%',
                padding: 2,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                borderRadius: 50,
            }}
            useGlass={true}
        >
            <UIContextMenu
                title="Send to device"
                actions={[
                    { id: 'files', title: "Files", icon: "folder" },
                    { id: 'photos', title: "Photos", icon: "photo" },
                ]}
                onAction={(id) => {
                    console.log("Context menu action pressed", id);
                    if (id === 'files') {
                        openDocPicker();
                    } else if (id === 'photos') {
                        openImagePicker();
                    }
                }}
                dropdownMenuMode
            >
                <UIButton type="link" icon='paperclip' themeColor="icon" />
            </UIContextMenu>
            <UITextInput
                variant="plain"
                style={{
                    flex: 1,
                    marginLeft: 8,
                }}
                placeholder="Send message"
                value={text}
                onChangeText={setText}
            />
            <UIButton
                type='link'
                themeColor={text.trim().length === 0 ? "textSecondary" : "highlight"}
                icon='arrow.up.circle.fill'
                disabled={text.trim().length === 0 || isActive || isSending}
                onPress={sendMessage}
            />
        </UIView>
    </>;
}
