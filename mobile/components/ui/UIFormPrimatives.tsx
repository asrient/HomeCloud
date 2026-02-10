import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { UIView } from './UIView';
import { UIText } from './UIText';
import { UIIcon } from './UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { isIos } from '@/lib/utils';

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type === React.Fragment) {
            result.push(...flattenChildren((child as React.ReactElement<{ children: React.ReactNode }>).props.children));
        } else {
            result.push(child);
        }
    });
    return result;
}

export type SectionProps = {
    title?: string;
    children: React.ReactNode;
};

export function Section({ title, children }: SectionProps) {
    const separatorColor = useThemeColor({}, 'seperator');
    const childArray = flattenChildren(children);

    return (
        <View style={styles.sectionContainer}>
            {title && (
                <UIText
                    style={styles.sectionTitle}
                    size={"md"}
                    color={'textSecondary'}
                    font="semibold">
                    {title}
                </UIText>
            )}
            <UIView
                themeColor={isIos ? 'backgroundTertiary' : undefined}
                borderRadius="lg"
                style={[
                    styles.sectionContent,
                    isIos && { borderRadius: 26 },
                    !isIos && {
                        borderWidth: 1,
                        borderColor: separatorColor,
                        backgroundColor: 'transparent',
                    },
                ]}
            >
                {childArray.map((child, index) => (
                    <React.Fragment key={index}>
                        {child}
                        {index < childArray.length - 1 && (
                            <View style={[styles.separator, { backgroundColor: separatorColor }]} />
                        )}
                    </React.Fragment>
                ))}
            </UIView>
        </View>
    );
}

export type LineProps = {
    title?: string;
    value?: string;
    children?: React.ReactNode;
    onPress?: () => void;
    showChevron?: boolean;
    destructive?: boolean;
};

export function Line({
    title,
    value,
    children,
    onPress,
    showChevron = false,
    destructive = false,
}: LineProps) {
    const separatorColor = useThemeColor({}, 'seperator');

    const textColor = destructive ? 'red' : undefined;

    const content = (
        <View
            style={styles.lineContainer}
        >
            {title && (
                <UIText
                    style={[styles.lineTitle, textColor ? { color: textColor } : null]}
                    size="md"
                    color={destructive ? undefined : 'text'}
                >
                    {title}
                </UIText>
            )}
            <View style={styles.lineRight}>
                {value && (
                    <UIText size="md" color="textSecondary" style={styles.lineValue}>
                        {value}
                    </UIText>
                )}
                {children}
                {(showChevron || onPress) && !children && (
                    <UIIcon
                        name="chevron.right"
                        size={16}
                        color={separatorColor}
                        style={styles.chevron}
                    />
                )}
            </View>
        </View>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    pressed && { opacity: 0.7 },
                ]}
            >
                {content}
            </Pressable>
        );
    }

    return content;
}

export type LineLinkProps = {
    text: string;
    onPress: () => void;
    color?: 'primary' | 'destructive' | 'default';
};

export function LineLink({ text, onPress, color = 'default' }: LineLinkProps) {
    const highlightColor = useThemeColor({}, 'highlight');
    const defaultTextColor = useThemeColor({}, 'text');
    const destructiveColor = 'red';

    let textColor = defaultTextColor;
    if (color === 'primary') {
        textColor = highlightColor;
    } else if (color === 'destructive') {
        textColor = destructiveColor;
    }

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.lineLinkContainer,
                pressed && { opacity: 0.7 },
            ]}
        >
            <UIText size="md" style={{ color: textColor }}>
                {text}
            </UIText>
        </Pressable>
    );
}

export function FormContainer({ children }: { children: React.ReactNode }) {
    return <View style={styles.formContainer}>{children}</View>;
}

const styles = StyleSheet.create({
    formContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    sectionContainer: {
        marginBottom: 24,
    },
    sectionTitle: {
        marginBottom: 8,
        marginLeft: isIos ? 16 : 4,
        letterSpacing: 0.5,
    },
    sectionContent: {
        overflow: 'hidden',
    },
    lineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: isIos ? 44 : 56,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    lineTitle: {
        flex: 1,
    },
    lineRight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 1,
        marginLeft: 8,
    },
    lineValue: {
        textAlign: 'right',
    },
    chevron: {
        marginLeft: 4,
    },
    lineLinkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: isIos ? 44 : 56,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 16,
    },
});
