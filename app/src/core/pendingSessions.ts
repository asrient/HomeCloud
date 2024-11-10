
import CustomError, { ErrorCode } from "./customError";
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

const pendingSessions = new Map<string, { pendingSession: PendingSession, expireTimer: NodeJS.Timeout | null }>();
let counter = 0;

export function requestSession({ userAgent, browserName }: { userAgent: string, browserName: string }): string {
    if (counter >= QUEUE_LIMIT) {
        throw CustomError.code(ErrorCode.LIMIT_REACHED, "Please try again later");
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
            rejectSession(id);
        }, EXPIRY_TIME),
    });
    counter++;
    // Todo: setup the gui code to show the dialog here
    // For now we are auto approving the session after 10 seconds
    setTimeout(() => {
        approveSession(id);
    }, 10000);
    return id;
}

export function approveSession(id: string): void {
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
    // todo: gui code to remove the dialog
}

export function rejectSession(id: string): void {
    // todo: gui code to remove the dialog
    deleteRequest(id);
}

function deleteRequest(id: string): void {
    const session = pendingSessions.get(id);
    counter--;
    if (!session) {
        return;
    }
    if (session.expireTimer) {
        clearTimeout(session.expireTimer);
    }
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
