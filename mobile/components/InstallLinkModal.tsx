import { View, StyleSheet, Pressable, Share } from 'react-native';
import { UIPageSheet } from './ui/UIPageSheet';
import { UIText } from './ui/UIText';
import { UIButton } from './ui/UIButton';
import { UIIcon } from './ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { getAppName } from '@/lib/utils';
import { useAlert } from '@/hooks/useAlert';
import { helpLinks } from 'shared/helpLinks';

const DOWNLOAD_URL = helpLinks.Download;

interface InstallLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function InstallLinkModal({ isOpen, onClose }: InstallLinkModalProps) {
    const highlightColor = useThemeColor({}, 'highlight');
    const separatorColor = useThemeColor({}, 'seperator');
    const appName = getAppName();
    const { showAlert } = useAlert();

    const handleCopyLink = () => {
        const localSc = modules.getLocalServiceController();
        try {
            localSc.system.copyToClipboard(DOWNLOAD_URL);
            showAlert('Link copied to clipboard');
        } catch (e) {
            console.error('Failed to copy link to clipboard', e);
            showAlert('Failed to copy link.');
        }
    };

    const handleShareLink = async () => {
        await Share.share({
            message: `Download ${appName} for your device.`,
            url: DOWNLOAD_URL,
        }, {
            dialogTitle: `Download ${appName}`,
        });
    };

    // const handleSendMail = async () => {
    //     console.log('Send mail clicked!');
    // };

    return (
        <UIPageSheet isOpen={isOpen} onClose={onClose} title="">
            <View style={styles.content}>
                <View style={styles.body}>
                    <View style={styles.iconRow}>
                        <UIIcon name="macbook.and.iphone" size={86} color={highlightColor} />
                    </View>

                    <UIText type="title" font="regular" style={styles.heading}>
                        Install {appName} on more devices.
                    </UIText>

                    <UIText size="md" color="textSecondary" style={styles.subtitle}>
                        Turn your PCs, laptops, phones and iPads into your personal instant cloud with {appName}.
                    </UIText>

                    <Pressable style={[styles.linkBox, { borderColor: separatorColor }]} onPress={handleCopyLink}>
                        <UIIcon name="clipboard" size={20} />
                        <UIText size="sm" color="text" style={styles.linkText} numberOfLines={2}>
                            {DOWNLOAD_URL}
                        </UIText>
                    </Pressable>
                </View>

                <View style={styles.footer}>
                    {/* <UIButton
                        size="lg"
                        stretch
                        type="secondary"
                        onPress={handleSendMail}
                        title="Send me a mail"
                    /> */}
                    <UIButton
                        size="lg"
                        stretch
                        onPress={handleShareLink}
                        title="Share Link"
                    />
                    <UIText size="xs" color="textSecondary" style={styles.footerNote}>
                        {appName} is available on MacOS, Windows, iOS, Android and Linux.
                    </UIText>
                </View>
            </View>
        </UIPageSheet>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 22,
        maxWidth: 450,
        width: '100%',
        alignSelf: 'center',
    },
    body: {
        paddingTop: 30,
    },
    iconRow: {
        marginBottom: 16,
    },
    heading: {
        marginBottom: 8,
    },
    subtitle: {
        marginBottom: 28,
    },
    linkBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 26,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    linkText: {
        flex: 1,
    },
    footer: {
        gap: 6,
        paddingBottom: 26,
        alignItems: 'center',
    },
    footerNote: {
        textAlign: 'center',
        marginTop: 2,
        paddingHorizontal: 20,
    },
});
