import { useEffect, useRef } from "react";
import { useAppState } from "./useAppState";

export const useAutoConnect = (fingerprint: string | null, key?: string) => {
    const currentKey = useRef<string | null>(null);
    const currentFingerprint = useRef<string | null>(null);
    const { instanceKey } = useAppState();

    useEffect(() => {
        const localSc = window.modules.getLocalServiceController();
        const autoConnectKey = key ? `${instanceKey}-${key}` : instanceKey;
        // Remove previous auto-connect if any
        if (currentKey.current && currentFingerprint.current) {
            localSc.net.removeAutoConnectFingerprint(currentFingerprint.current, currentKey.current);
        }
        currentKey.current = autoConnectKey ?? null;
        currentFingerprint.current = fingerprint;
        if (fingerprint !== null && autoConnectKey) {
            localSc.net.addAutoConnectFingerprint(fingerprint, autoConnectKey);
        }
        return () => {
            fingerprint && autoConnectKey && localSc.net.removeAutoConnectFingerprint(fingerprint, autoConnectKey);
        }
    }, [fingerprint, instanceKey, key]);
}
