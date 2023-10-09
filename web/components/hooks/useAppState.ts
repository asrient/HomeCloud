import { useCallback, useContext } from 'react';
import { AppContext, DispatchContext, ActionTypes } from '../../lib/state';

export function useAppState() {
    return useContext(AppContext);
}

export function useAppDispatch() {
    const dispatch = useContext(DispatchContext);
    return useCallback((type: ActionTypes, payload: any) => dispatch && dispatch({ type, payload }), [dispatch]);
}
