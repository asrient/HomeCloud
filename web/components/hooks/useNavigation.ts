import { NextUrl } from "@/lib/types";
import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppState } from "./useAppState";
import { ActionTypes } from "@/lib/state";

const BACK_FLAG = 'back'

export function useNavigation() {
    const router = useRouter();
    const { query, back } = router;
    const dispatch = useAppDispatch();

    const canGoBack = useMemo(() => {
        const flagValue = query[BACK_FLAG];
        if (flagValue === 'off') {
            return false;
        }
        return true;
    }, [query]);

    const goBack = useCallback(() => {
        if (canGoBack) {
            back();
        }
    }, [back, canGoBack]);

    const openDevicePage = useCallback((fingerprint: string | null, nextUrl?: NextUrl) => {
        nextUrl = nextUrl || { pathname: '/' };
        if (!nextUrl.query) {
            nextUrl.query = {};
        }
        nextUrl.query[BACK_FLAG] = 'off';
        router.push(nextUrl);
        dispatch(ActionTypes.SELECT_DEVICE, {
            fingerprint,
        });
    }, [dispatch, router]);

    return {
        canGoBack,
        goBack,
        openDevicePage,
    }
}
