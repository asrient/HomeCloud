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
            let value = query[key];
            let requiredValue = nextUrl.query[key];
            if (requiredValue === null) {
                // If the next URL requires a null value, we consider an empty string as a match.
                requiredValue = '';
            }
            if (requiredValue != value) return false;
        }
        return true;
    }, [pathname, query]);
}
