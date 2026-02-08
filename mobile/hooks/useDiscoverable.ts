import { useAccountStore } from './useAccountState';
import { useNetworkState } from 'expo-network';
import { UNSUPPORTED_NETWORK_TYPES } from '@/lib/types';

export function useDiscoverable() {
    const serverConnected = useAccountStore(state => state.serverConnected);
    const networkState = useNetworkState();

    const networkSupported = !!networkState.isConnected
        && (!networkState.type || !UNSUPPORTED_NETWORK_TYPES.includes(networkState.type));

    return serverConnected || networkSupported;
}
