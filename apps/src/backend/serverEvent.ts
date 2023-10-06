
export type ServerEvent = {
    type: string;
    profileId: number;
    data: any;
}

const dispatchCallbacks: ((event: ServerEvent) => Promise<void>)[] = [];

export function handleServerEvent(cb: (event: ServerEvent) => Promise<void>) {
    dispatchCallbacks.push(cb);
}

export async function pushServerEvent(event: ServerEvent) {
    console.log('Publishing server event:', event);
    if (!!dispatchCallbacks) {
        await Promise.all(dispatchCallbacks.map(handler => handler(event)));
    }
}
