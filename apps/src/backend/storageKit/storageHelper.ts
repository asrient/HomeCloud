import { FsDriver } from "./interface";
import { StorageType, envConfig } from "../envConfig";
import { Storage, Profile } from "../models";
import { WebdavFsDriver } from "./webdav";
import { GoogleFsDriver } from "./google";

export async function getFsDriverById(
  profile: Profile,
  storageId: number,
): Promise<[Storage, FsDriver]> {
  const storage = await profile.getStorageById(storageId);
  if (!storage) {
    throw new Error(`Storage ${storageId} not found`);
  }
  return [storage, await getFsDriver(storage)];
}

export async function getFsDriver(storage: Storage) {
  const storageType = storage.type as StorageType;
  if (!envConfig.isStorageTypeEnabled(storageType)) {
    throw new Error(`Storage type ${storageType} is not valid or disabled.`);
  }

  let driver: FsDriver;
  switch (storageType) {
    case StorageType.WebDav:
      driver = new WebdavFsDriver(storage);
      break;
    case StorageType.Google:
      driver = new GoogleFsDriver(storage);
      break;
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
  await driver.init();
  return driver;
}
