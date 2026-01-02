import { PeerInfo } from "shared/types";
import { UIView } from "./ui/UIView";
import { UIButton } from "./ui/UIButton";
import { TextInput } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";


export type DeviceSendBarProps = {
    peerInfo: PeerInfo;
};

export function DeviceSendBar({ peerInfo }: DeviceSendBarProps) {
    const textColor = useThemeColor({}, 'text');
    return <UIView
        themeColor="backgroundSecondary"
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
        <UIButton type="link" icon='paperclip' />
        <TextInput
            style={{
                flex: 1,
                marginLeft: 8,
                color: textColor,
            }}
            placeholder="Send message"
        />
        <UIButton type="link" icon='paperplane' />
    </UIView>;
}
