import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks pull-to-refresh state separately from initial loading.
 * Returns `refreshing` (true only during user-initiated refresh)
 * and `onRefresh` to pass to FlashList/FlatList.
 */
export function useRefresh(reload: () => void, isLoading: boolean) {
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        reload();
    }, [reload]);

    useEffect(() => {
        if (!isLoading && refreshing) setRefreshing(false);
    }, [isLoading, refreshing]);

    return { refreshing, onRefresh };
}
