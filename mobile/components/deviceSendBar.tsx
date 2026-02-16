import { PeerInfo } from "shared/types";
import { UIView } from "./ui/UIView";
import { UIButton } from "./ui/UIButton";
import { UITextInput } from "./ui/UITextInput";
import { UIContextMenu } from './ui/UIContextMenu';
import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { getServiceController } from "shared/utils";
import { getLocalServiceController } from "@/lib/utils";
import { LoadingModal } from "./LoadingModal";
import * as DocumentPicker from 'expo-document-picker';
import { File } from "expo-file-system/next";
import * as ImagePicker from 'expo-image-picker';

export type DeviceSendBarProps = {
    peerInfo: PeerInfo;
};

export function DeviceSendBar({ peerInfo }: DeviceSendBarProps) {
    const [isSending, setIsSending] = useState(false);
    const [text, setText] = useState('');

    const sendMessage = useCallback(async () => {
        if (text.trim().length === 0) {
            return;
        }
        setIsSending(true);
        const sc = await getServiceController(peerInfo.fingerprint);
        sc.app.receiveContent(null, text.trim(), 'text').catch((error) => {
            console.error('Error sending message to device:', error);
            const localSc = getLocalServiceController();
            localSc.system.alert('Could not send', 'An error occurred.');
        });
        setText('');
        setIsSending(false);
    }, [text, peerInfo.fingerprint]);

    const openDocPicker = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                multiple: true,
                copyToCacheDirectory: true,
            });
            if (result.canceled) {
                return;
            }
            const assets = result.assets;
            if (assets.length === 0) {
                return;
            }
            setIsSending(true);
            const sc = await getServiceController(peerInfo.fingerprint);
            for (const asset of assets) {
                await sc.files.download(modules.config.FINGERPRINT, asset.uri);
                // now delete the cached file
                const file = new File(asset.uri);
                if (file.exists) {
                    file.delete();
                }
            }
        } catch (error) {
            console.error('Error picking document:', error);
            const localSc = getLocalServiceController();
            localSc.system.alert('Could not send', 'An error occurred while picking the document.');
        } finally {
            setIsSending(false);
        }
    }, [peerInfo.fingerprint]);

    const openImagePicker = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                allowsMultipleSelection: true,
            });
            if (result.canceled) {
                return;
            }
            const assets = result.assets;
            if (assets.length === 0) {
                return;
            }
            setIsSending(true);
            const sc = await getServiceController(peerInfo.fingerprint);
            for (const asset of assets) {
                await sc.files.download(modules.config.FINGERPRINT, asset.uri);
            }
        } catch (error) {
            console.error('Error picking images:', error);
            const localSc = getLocalServiceController();
            localSc.system.alert('Could not send', 'An error occurred while picking the images.');
        } finally {
            setIsSending(false);
        }
    }, [peerInfo.fingerprint]);

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
                disabled={text.trim().length === 0 || isSending}
                onPress={sendMessage}
            />
        </UIView>
        <LoadingModal isActive={isSending} />
    </>;
}
