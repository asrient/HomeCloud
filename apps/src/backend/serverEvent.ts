
export type ServerEvent = {
    type: string;
    profileId: string;
    data: any;
}

let dispatchCallback: (event: ServerEvent) => Promise<boolean>;

export function handleServerEvent(cb: (event: ServerEvent) => Promise<boolean>) {
    dispatchCallback = cb;
}

export async function pushServerEvent(event: ServerEvent) {
    if (!!dispatchCallback) {
        return dispatchCallback(event);
    }
    return false;
}
