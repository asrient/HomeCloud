import { staticConfig } from '@/lib/staticConfig';

export type LoginParams = {
    username?: string;
    password?: string;
    profileId?: string;
};

export async function login({ username, password, profileId }: LoginParams) {
    const resp = await fetch(`${staticConfig.apiBaseUrl}/profile/login`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        referrerPolicy: 'no-referrer',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, profileId }),
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data.message);
    }
    return data;
}

export type SignupParams = {
    name: string;
    username?: string;
    password?: string;
};

export async function signup(params: SignupParams) {
    const resp = await fetch(`${staticConfig.apiBaseUrl}/profile/create`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        referrerPolicy: 'no-referrer',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data.detail.error);
    }
    return data;
}

export async function initalialState() {
    const response = await fetch(`${staticConfig.apiBaseUrl}/state`, {
        mode: 'cors',
        credentials: 'include',
        referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
        throw new Error('Failed to fetch state');
    }
    const data = await response.json();
    return data;
}

export async function listProfiles() {
    const response = await fetch(`${staticConfig.apiBaseUrl}/profile/list`, {
        mode: 'cors',
        credentials: 'include',
        referrerPolicy: 'no-referrer',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message);
    }
    return data;
}
