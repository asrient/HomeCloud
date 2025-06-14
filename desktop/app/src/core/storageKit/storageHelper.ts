import { FsDriver } from "./interface";
import { StorageType, envConfig } from "../envConfig";
import { Storage } from "../models";
import { WebdavFsDriver } from "./webdav";
import { GoogleFsDriver } from "./google";
import { LocalFsDriver } from "./local";
import { DropboxFsDriver } from "./dropbox";
import { AgentFsDriver } from "./agent";

export async function getFsDriverByStorageId(
  storageId: number,
): Promise<[Storage, FsDriver]> {
  const storage = await Storage.getById(storageId);
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
    case StorageType.Local:
      driver = new LocalFsDriver(storage);
      break;
    case StorageType.Dropbox:
      driver = new DropboxFsDriver(storage);
      break;
    case StorageType.Agent:
      driver = new AgentFsDriver(storage);
      break;
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
  await driver.init();
  return driver;
}
