import { useCallback, useContext, useRef, useEffect } from 'react';
import { AppContext, DispatchContext, ActionTypes } from '../../lib/state';

export function useAppState() {
    return useContext(AppContext);
}

export function useAppDispatch() {
    const dispatch = useContext(DispatchContext);
    
    // Keep a ref to the current dispatch function
    const dispatchRef = useRef(dispatch);
    
    // Update the ref whenever dispatch changes
    useEffect(() => {
        dispatchRef.current = dispatch;
    }, [dispatch]);
    
    // Return a stable function that uses the ref
    return useCallback(
        (type: ActionTypes, payload: any) => {
            if (dispatchRef.current) {
                dispatchRef.current({ type, payload });
            }
        },
        [] // This function is stable and doesn't depend on dispatch directly
    );
}
