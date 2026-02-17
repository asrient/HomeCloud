import { useAccountStore } from './useAccountState';
import { useNetworkState } from 'expo-network';
import { ConnectionType, UNSUPPORTED_NETWORK_TYPES } from '@/lib/types';

export function useDiscoverable() {
    const { serverConnected } = useAccountStore();
    const networkState = useNetworkState();

    const localSc = modules.getLocalServiceController();
    const ifaceStatuses = localSc.net.getConnectionInterfaceStatuses();
    const isLocalEnabled = ifaceStatuses.some(s => s.type === ConnectionType.LOCAL && s.enabled);
    const isWebEnabled = ifaceStatuses.some(s => s.type === ConnectionType.WEB && s.enabled);

    const isLocalActive = !!(isLocalEnabled && networkState.type && !UNSUPPORTED_NETWORK_TYPES.includes(networkState.type));
    const isWebActive = !!(isWebEnabled && serverConnected);
    const isDiscoverable = isWebActive || isLocalActive;

    return { isDiscoverable, isWebActive, isLocalActive, isWebEnabled, isLocalEnabled };
}
