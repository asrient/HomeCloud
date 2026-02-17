import { StyleSheet, Modal, Dimensions, ActivityIndicator, View } from 'react-native';
import { PhotosQuickAction, PhotoView } from '@/lib/types';
import { UIText } from './ui/UIText';
import { Directory, Paths, File } from 'expo-file-system/next';
import { getServiceController, isIos, supportsHeic } from '@/lib/utils';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';
import { FlashList } from "@shopify/flash-list";
import { Image } from 'expo-image';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { UIButton } from './ui/UIButton';
import { useVideoPlayer, VideoView } from 'expo-video';

export type PhotosPreviewModalProps = {
    photos: PhotoView[];
    startIndex: number;
    isOpen: boolean;
    onClose: (index?: number) => void;
    isLoading?: boolean;
    error?: string | null;
    load?: () => Promise<void>;
    hasMore?: boolean;
    onQuickAction?: (action: PhotosQuickAction) => void;
};

function assetHash(remoteFingerprint: string, id: string) {
    return modules.crypto.hashString(`${remoteFingerprint}-${id}`, 'md5').slice(0, 16);
}

function getCacheDir() {
    return Paths.join(modules.config.CACHE_DIR, 'PHPreviewTmp');
}

function clearCache() {
    const cacheDir = getCacheDir();
    const dir = new Directory(cacheDir);
    if (dir.exists) {
        dir.delete();
    }
}

async function getAssetUri(photo: PhotoView): Promise<string> {
    if (!photo.deviceFingerprint) return photo.fileId;
    if (photo.assetUrl) {
        const cacheFile = new File(photo.assetUrl);
        if (cacheFile.exists) {
            return photo.assetUrl;
        } else {
            delete photo.assetUrl;
        }
    }
    const cacheDir = getCacheDir();
    const cacheKey = assetHash(photo.deviceFingerprint, photo.id);
    const cacheFile = new File(Paths.join(cacheDir, cacheKey));
    if (cacheFile.exists) {
        return cacheFile.uri;
    }
    const serviceController = await getServiceController(photo.deviceFingerprint);
    const remoteItem = await serviceController.files.getPreview(photo.fileId, { supportsHeic });
    cacheFile.create({ overwrite: true, intermediates: true });
    await remoteItem.stream.pipeTo(cacheFile.writableStream());
    photo.assetUrl = cacheFile.uri;
    return cacheFile.uri;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function isVideoMimeType(mimeType: string): boolean {
    return mimeType.startsWith('video/');
}

// Video playback component
function VideoItem({ photo, isActive, isFocused, showControls, onTap, onClose }: { photo: PhotoView; isActive: boolean, isFocused: boolean, showControls: boolean, onTap?: () => void, onClose?: () => void }) {
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const player = useVideoPlayer(videoUri, (player) => {
        player.loop = false;
    });

    useEffect(() => {
        if (isActive && !videoUri) {
            setIsLoading(true);
            setError(null);
            getAssetUri(photo)
                .then((uri) => {
                    setVideoUri(uri);
                    setIsLoading(false);
                })
                .catch((err) => {
                    console.error('Error loading video:', err);
                    setError('Failed to load video');
                    setIsLoading(false);
                });
        }
    }, [photo, isActive, videoUri]);

    // Listen to player status changes
    useEffect(() => {
        if (!player) return;
        const subscription = player.addListener('playingChange', (event) => {
            setIsPlaying(event.isPlaying);
        });
        return () => subscription.remove();
    }, [player]);

    // Pause video when not focused (swiped away)
    useEffect(() => {
        if (!isFocused && player) {
            player.pause();
        }
    }, [isFocused, player]);

    const handleTap = useCallback(() => {
        onTap?.();
    }, [onTap]);

    const togglePlayPause = useCallback(() => {
        if (!player) return;
        if (isPlaying) {
            player.pause();
        } else {
            // If video has ended (currentTime at or near duration), seek to beginning
            if (player.duration > 0 && player.currentTime >= player.duration - 0.1) {
                player.currentTime = 0;
            }
            player.play();
        }
    }, [player, isPlaying]);

    if (isLoading) {
        return (
            <View style={styles.photoContainer}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    if (error || !videoUri) {
        return (
            <View style={styles.photoContainer}>
                <UIText style={{ color: '#fff' }}>{error || 'Failed to load'}</UIText>
            </View>
        );
    }

    const tapGesture = Gesture.Tap()
        .onEnd(() => {
            'worklet';
            scheduleOnRN(handleTap);
        });

    return (
        <View style={styles.photoContainer}>
            <GestureDetector gesture={tapGesture}>
                <View style={styles.video}>
                    <VideoView
                        player={player}
                        style={styles.video}
                        contentFit="contain"
                        nativeControls={false}
                    />
                </View>
            </GestureDetector>
            {showControls && (
                <View style={styles.videoControlsOverlay}>
                    <UIButton
                        onPress={togglePlayPause}
                        type="secondary"
                        icon={isPlaying ? 'pause.fill' : 'play.fill'}
                        style={styles.playPauseButton}
                    />
                </View>
            )}
        </View>
    );
}

// Individual photo item with zoom/pan gestures
function ImageItem({ photo, isActive, onTap, onClose }: { photo: PhotoView; isActive: boolean, onTap?: () => void, onClose?: () => void }) {
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    useEffect(() => {
        if (isActive) {
            setIsLoading(true);
            setError(null);
            getAssetUri(photo)
                .then((uri) => {
                    setImageUri(uri);
                    setIsLoading(false);
                })
                .catch((err) => {
                    console.error('Error loading photo:', err);
                    setError('Failed to load photo');
                    setIsLoading(false);
                });
        }
    }, [photo, isActive]);

    const handleTapJS = useCallback(() => {
        onTap && onTap();
    }, [onTap]);

    const handleCloseJS = useCallback(() => {
        onClose && onClose();
    }, [onClose]);

    const handleTap = () => {
        'worklet';
        if (scale.value > 1) return; // Don't toggle UI when zoomed
        scheduleOnRN(handleTapJS);
    };

    // Reset zoom when switching photos
    useEffect(() => {
        if (!isActive) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive]);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            const newScale = savedScale.value * e.scale;
            scale.value = Math.min(Math.max(newScale, 0.3), 5);

            // Zoom towards the focal point
            const focalX = e.focalX - SCREEN_WIDTH / 2;
            const focalY = e.focalY - SCREEN_HEIGHT / 2;

            translateX.value = savedTranslateX.value + (focalX - focalX * e.scale);
            translateY.value = savedTranslateY.value + (focalY - focalY * e.scale);
        })
        .onEnd(() => {
            if (scale.value < 0.6) {
                // Close modal if zoomed out below threshold
                scheduleOnRN(handleCloseJS);
            } else if (scale.value <= 1) {
                scale.value = withSpring(1);
                savedScale.value = 1;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                savedScale.value = scale.value;
                savedTranslateX.value = translateX.value;
                savedTranslateY.value = translateY.value;
            }
        });

    const panGesture = Gesture.Pan()
        .enabled(scale.value > 1)
        .activeOffsetX([-10, 10])
        .activeOffsetY([-10, 10])
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((e) => {
            if (scale.value > 1) {
                scale.value = withSpring(1);
                savedScale.value = 1;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                const newScale = 2.5;
                scale.value = withSpring(newScale);
                savedScale.value = newScale;

                // Center on tap position
                const centerX = SCREEN_WIDTH / 2;
                const centerY = SCREEN_HEIGHT / 2;
                const offsetX = (centerX - e.x) * (newScale - 1);
                const offsetY = (centerY - e.y) * (newScale - 1);

                translateX.value = withSpring(offsetX);
                translateY.value = withSpring(offsetY);
                savedTranslateX.value = offsetX;
                savedTranslateY.value = offsetY;
            }
        });

    const singleTapGesture = Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(handleTap);

    const zoomPanGesture = Gesture.Simultaneous(pinchGesture, panGesture);
    const tapGesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
    const composedGesture = Gesture.Race(tapGesture, zoomPanGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    if (isLoading) {
        return (
            <View style={styles.photoContainer}>
                <ActivityIndicator size="large" color="#fff" />
            </View>
        );
    }

    if (error || !imageUri) {
        return (
            <View style={styles.photoContainer}>
                <UIText style={{ color: '#fff' }}>{error || 'Failed to load'}</UIText>
            </View>
        );
    }

    return (
        <View style={styles.photoContainer}>
            <GestureDetector gesture={composedGesture}>
                <Animated.View style={[styles.imageWrapper, animatedStyle]}>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        contentFit="contain"
                    />
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

// Wrapper component that renders either ImageItem or VideoItem based on mimeType
function PhotoItem({ photo, isActive, isFocused, showControls, onTap, onClose }: { photo: PhotoView; isActive: boolean, isFocused: boolean, showControls: boolean, onTap?: () => void, onClose?: () => void }) {
    if (isVideoMimeType(photo.mimeType)) {
        return <VideoItem photo={photo} isActive={isActive} isFocused={isFocused} showControls={showControls} onTap={onTap} onClose={onClose} />;
    }
    return <ImageItem photo={photo} isActive={isActive} onTap={onTap} onClose={onClose} />;
}

export function PhotosPreviewModal({ photos, startIndex, isOpen, onClose, onQuickAction }: PhotosPreviewModalProps) {
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const flashListRef = useRef<any>(null);
    const [viewableIndices, setViewableIndices] = useState<Set<number>>(new Set([startIndex]));
    const [showUI, setShowUI] = useState(true);
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const bgColor = isIos && showUI && !isDark ? '#fff' : '#000';

    useEffect(() => {
        if (isOpen) {
            clearCache();
            setCurrentIndex(startIndex);
            setViewableIndices(new Set([startIndex]));

            // Scroll to start index when modal opens
            setTimeout(() => {
                flashListRef.current?.scrollToIndex({
                    index: startIndex,
                    animated: false,
                });
            }, 100);
        }
    }, [isOpen, startIndex]);

    const exitPreview = useCallback(() => {
        clearCache();
        onClose(currentIndex);
    }, [onClose, currentIndex]);

    const handleTap = useCallback(() => {
        console.log('Tapping photo to toggle UI');
        setShowUI((prev) => !prev);
    }, []);

    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            const newIndices = new Set<number>();
            viewableItems.forEach((item: any) => {
                if (item.index !== null && item.index !== undefined) {
                    newIndices.add(item.index);
                    // Preload adjacent photos
                    if (item.index > 0) newIndices.add(item.index - 1);
                    if (item.index < photos.length - 1) newIndices.add(item.index + 1);
                }
            });
            setViewableIndices(newIndices);

            // Update current index to the first viewable item
            const firstViewable = viewableItems[0];
            if (firstViewable?.index !== null && firstViewable?.index !== undefined) {
                const newIndex = firstViewable.index;
                setCurrentIndex((prevIndex) => {
                    // Show UI when swiping to a new photo
                    if (prevIndex !== newIndex) {
                        setShowUI(true);
                    }
                    return newIndex;
                });
            }
        }
    }, [photos.length]);

    const viewabilityConfig = useMemo(() => ({
        itemVisiblePercentThreshold: 50,
        waitForInteraction: false,
    }), []);

    const handleHeaderAction = useCallback((actionType: 'export' | 'delete') => {
        const photo = photos[currentIndex];
        if (!photo || !onQuickAction) return;
        const action: PhotosQuickAction = {
            type: actionType,
            photo,
        };
        onQuickAction(action);
    }, [currentIndex, photos, onQuickAction]);

    return (
        <Modal visible={isOpen} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={exitPreview}>
            <GestureHandlerRootView style={[styles.container, { backgroundColor: bgColor }]}>

                <View style={[styles.container, { backgroundColor: bgColor }]}>
                    {/* Header with close button and counter */}
                    {
                        showUI && <View style={styles.header}>
                            <View style={styles.headerGroup}>
                                <UIButton onPress={exitPreview} type='secondary' icon='xmark' />
                            </View>
                            <View style={styles.headerGroup}>
                                <UIButton type='secondary' icon='square.and.arrow.up'
                                    onPress={() => handleHeaderAction('export')} />
                                <UIButton type='secondary' icon='trash' onPress={() => handleHeaderAction('delete')} />
                            </View>
                        </View>
                    }

                    {/* Photo gallery */}
                    <FlashList
                        ref={flashListRef}
                        data={photos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item, index }) => (
                            <PhotoItem
                                photo={item}
                                onTap={handleTap}
                                onClose={exitPreview}
                                isActive={viewableIndices.has(index!)}
                                isFocused={currentIndex === index}
                                showControls={showUI}
                            />
                        )}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewabilityConfig}
                    />
                </View>

            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 100,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        zIndex: 10,
    },
    headerGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    photoContainer: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageWrapper: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
    video: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
    videoControlsOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'box-none',
    },
    playPauseButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
