import { requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { ViewProps } from 'react-native';

export type H264PlayerViewProps = {
  sessionId: string;
} & ViewProps;

const NativeView: React.ComponentType<H264PlayerViewProps> =
  requireNativeViewManager('H264Player');

export default function H264PlayerView(props: H264PlayerViewProps) {
  return <NativeView {...props} />;
}
