import { PendingAuth, Profile, Storage } from "../models";
import { envConfig, StorageType } from "../envConfig";
import { joinUrlPath } from "../utils";

export async function initiate(profile: Profile, storageType: StorageType) {
  if (
    !envConfig.isStorageTypeEnabled(storageType) ||
    !envConfig.isOneAuthEnabled()
  ) {
    throw new Error("Storage is not enabled");
  }
  const apiUrl = joinUrlPath(
    envConfig.ONEAUTH_SERVER_URL!,
    "/api/session/initiate",
  );
  console.log("Initiating auth", apiUrl, envConfig.ONEAUTH_APP_ID, storageType);
  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appId: envConfig.ONEAUTH_APP_ID,
      redirectUrl: joinUrlPath(envConfig.API_BASE_URL, "/storage/callback"),
      storageType: storageType,
    }),
  });
  if (!resp.ok) {
    const body = await resp.json();
    console.error("Error initiating auth", body);
    throw new Error("Could not initiate auth: " + body.message);
  }
  const { authUrl, referenceId, partialCode1 } = await resp.json();

  const pendingAuth = await PendingAuth.createPendingAuth({
    profile,
    storageType,
    referenceId,
    partialCode1,
  });
  return { pendingAuth, authUrl };
}

async function fetchAccessToken(apiKey: string): Promise<{
  accessToken: string;
  expiresOn: Date;
  oneAuthId: string;
  storageType: string;
  targetId: string;
}> {
  const resp = await fetch(
    joinUrlPath(envConfig.ONEAUTH_SERVER_URL!, "/api/session/token"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId: envConfig.ONEAUTH_APP_ID,
        apiKey,
      }),
    },
  );
  if (!resp.ok) {
    const body = await resp.json();
    console.error("Error fetching access token", body);
    throw new Error("Could not fetch access token");
  }
  const {
    token: { accessToken, expiryDate },
    account: { id, storageType, targetId },
  } = await resp.json();
  return {
    accessToken,
    expiresOn: new Date(expiryDate),
    oneAuthId: id,
    storageType,
    targetId,
  };
}

export async function complete(referenceId: string, partialCode2: string) {
  const pendingAuth = await PendingAuth.getByReferenceId(referenceId);
  if (!pendingAuth) {
    throw new Error("Invalid reference id");
  }
  const secret = pendingAuth.makeSecret(partialCode2);
  const { accessToken, expiresOn, oneAuthId, storageType } =
    await fetchAccessToken(secret);
  if (storageType !== pendingAuth.storageType) {
    console.error(
      "Storage type mismatch",
      storageType,
      pendingAuth.storageType,
    );
    throw new Error("Storage type mismatch");
  }
  const storage = await pendingAuth.createStorage({ oneAuthId, partialCode2 });
  await storage.setAccessToken({ accessToken, expiresOn });
  return storage;
}

export async function refreshAccessToken(storage: Storage) {
  const { accessToken, expiresOn } = await fetchAccessToken(storage.secret!);
  await storage.setAccessToken({ accessToken, expiresOn });
}

export async function getAccessToken(storage: Storage) {
  if (storage.hasActiveAccessToken()) {
    return storage.accessToken;
  }
  await refreshAccessToken(storage);
  return storage.accessToken;
}
