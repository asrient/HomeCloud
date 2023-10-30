import { NextUrl } from "@/lib/types";
import { useRouter } from "next/router";
import { useCallback } from "react";

export function useUrlMatch() {
    const router = useRouter();
    const { pathname, query } = router;

    return useCallback((nextUrl: NextUrl) => {
        if (pathname != nextUrl.pathname) return false;
        if (!nextUrl.query) return true;
        const keys = Object.keys(nextUrl.query);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (nextUrl.query[key] != query[key]) return false;
        }
        return true;
    }, [pathname, query]);
}
