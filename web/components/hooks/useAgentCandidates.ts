import { useCallback, useEffect, useRef, useState } from "react";
import { AgentCandidate } from "@/lib/types";
import { scan } from "@/lib/api/discovery";

export default function useAgentCandidates(isActive: boolean) {
    const [candidates, setCandidates] = useState<AgentCandidate[] | null>(null);
    const fetchTimerRef = useRef<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const loadingRef = useRef<boolean>(false);
    const firstScanRef = useRef<boolean>(true);

    const fetchCandidates = useCallback(async () => {
        if (loadingRef.current) {
            return;
        }
        try {
            loadingRef.current = true;
            setError(null);
            const force = firstScanRef.current;
            firstScanRef.current = false;
            const candidates_ = await scan(force);
            setCandidates(candidates_);
        } finally {
            loadingRef.current = false;
        }
    }, []);

    const pollScan = useCallback(async () => {
        if (fetchTimerRef.current) {
            clearTimeout(fetchTimerRef.current);
        }
        let delay = 4000;
        try {
            await fetchCandidates();
        } catch (e: any) {
            setError(e.message);
            delay = 8000;
        }
        if (fetchTimerRef.current) {
            clearTimeout(fetchTimerRef.current);
        }
        if (isActive) {
            fetchTimerRef.current = window.setTimeout(pollScan, delay);
        }
    }, [fetchCandidates, isActive]);

    useEffect(() => {
        if (!isActive) {
            fetchTimerRef.current && clearTimeout(fetchTimerRef.current);
            return;
        }
        pollScan();
        return () => {
            if (fetchTimerRef.current) {
                clearTimeout(fetchTimerRef.current);
            }
        };
    }, [fetchCandidates, isActive, pollScan]);

    return { candidates, error };
}
