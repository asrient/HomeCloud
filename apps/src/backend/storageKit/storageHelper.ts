import { FsDriver } from "./interface";
import { StorageType, envConfig } from "../envConfig";
import { Storage, Profile } from "../models";
import { WebdavFsDriver } from "./webdav";


export async function getFsDriverById(profile: Profile, storageId: number): Promise<[Storage, FsDriver]> {
    const storage = await profile.getStorageById(storageId);
    if (!storage) {
        throw new Error(`Storage ${storageId} not found`);
    }
    return [storage, getFsDriver(storage)];
}

export function getFsDriver(storage: Storage) {
    const storageType = storage.type as StorageType;

    if (!envConfig.isStorageTypeEnabled(storageType)) {
        throw new Error(`Storage type ${storageType} is not valid or disabled.`);
    }
    switch (storageType) {
        case StorageType.WebDav:
            return new WebdavFsDriver(storage);
        default:
            throw new Error(`Unknown storage type ${storageType}`);
    }
}
