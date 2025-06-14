
import CustomError, { ErrorCode } from "./customError";
import { NativeAsk, native } from "./native";
import { uuid } from "./utils/cryptoUtils";

const EXPIRY_TIME = 600000; // 10 minutes
const QUEUE_LIMIT = 10;

interface PendingSession {
    id: string;
    approved: boolean;
    requestedAt: Date | null;
    userAgent: string;
    browserName: string;
}

const pendingSessions = new Map<string, { pendingSession: PendingSession, expireTimer: NodeJS.Timeout | null, ask: NativeAsk }>();
let counter = 0;

export function requestSession({ userAgent, browserName }: { userAgent: string, browserName: string }): string {
    if (counter >= QUEUE_LIMIT) {
        throw CustomError.code(ErrorCode.LIMIT_REACHED, "Please try again later");
    }

    if (!native) {
        throw CustomError.generic("Native dialog not available");
    }

    const id = uuid();
    pendingSessions.set(id, {
        pendingSession:
        {
            id,
            approved: false,
            requestedAt: new Date(),
            userAgent,
            browserName,
        },
        expireTimer: setTimeout(() => {
            rejectSession(id, true);
        }, EXPIRY_TIME),
        ask: native.ask({
            title: `Allow "${browserName}" to access HomeCloud?`,
            buttons: [
                {
                    text: "Deny",
                    isDefault: true,
                    onPress: () => {
                        rejectSession(id);
                    },
                },
                {
                    text: "Allow",
                    isHighlighted: true,
                    onPress: () => {
                        approveSession(id);
                    },
                },
            ],
        }),
    });
    counter++;
    return id;
}

export function approveSession(id: string): void {
    console.log("Approving session request:", id);
    const session = pendingSessions.get(id);
    if (!session) {
        return;
    }
    session.pendingSession.approved = true;
    // reset the existing expire timer
    if (session.expireTimer) {
        clearTimeout(session.expireTimer);
        session.expireTimer = null;
    }
    // set a new expire timer
    session.expireTimer = setTimeout(() => {
        deleteRequest(id);
    }, EXPIRY_TIME);
}

export function rejectSession(id: string, closeDialog = false): void {
    console.log("Rejecting session request:", id);
    if (closeDialog) {
        const session = pendingSessions.get(id);
        if (session) {
            session.ask.close();
        }
    }
    deleteRequest(id);
}

function deleteRequest(id: string): void {
    const session = pendingSessions.get(id);
    if (!session) {
        return;
    }
    if (session.expireTimer) {
        clearTimeout(session.expireTimer);
    }
    counter--;
    pendingSessions.delete(id);
}

export function getApprovalStatus(id: string): boolean {
    const session = pendingSessions.get(id);
    if (!session) {
        throw CustomError.generic("Session request was denied or has expired.");
    }
    const status = session.pendingSession.approved;
    // Remove the session from the map once it's approved and the status is checked by the client
    if (status) {
        deleteRequest(id);
    }
    return status;
}
