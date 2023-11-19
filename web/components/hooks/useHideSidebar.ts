import { useCallback } from "react";
import { useAppDispatch } from "../hooks/useAppState";
import { ActionTypes } from "@/lib/state";

export default function useHideSidebar() {
    const dispatch = useAppDispatch();

    return useCallback(() => {
        dispatch(ActionTypes.TOGGLE_SIDEBAR, {
            showSidebar: false,
        })
    }, [dispatch]);
}
