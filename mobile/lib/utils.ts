export function printFingerprint(fingerprint: string, full = false) {
    if (full) {
        return fingerprint;
    }
    return `$${fingerprint.slice(0, 8)}`;
}

export async function getServiceController(fingerprint: string | null) {
    if (!fingerprint) {
        return modules.getLocalServiceController();
    }
    return modules.getRemoteServiceController(fingerprint);
}

export function libraryHashFromId(fingerprint: string | null, libraryId: string) {
    return `${fingerprint}-${libraryId}`;
}
