import { useAccountStore } from './useAccountState';
import { useNetworkState } from 'expo-network';
import { UNSUPPORTED_NETWORK_TYPES } from '@/lib/types';

export function useDiscoverable() {
    const { serverConnected } = useAccountStore();
    const networkState = useNetworkState();

    const localNetworkActive = networkState.type && !UNSUPPORTED_NETWORK_TYPES.includes(networkState.type);

    return serverConnected || localNetworkActive;
}
