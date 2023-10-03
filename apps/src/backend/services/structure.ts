import { StorageMeta } from "../models";
import { FsDriver } from "../storageKit/interface";

async function setup(fsDriver: FsDriver): Promise<StorageMeta> {
    const storage = fsDriver.storage;
    const meta = {
        hcRoot: '',
        thumbsDir: '',
        photosDir: '',
        photosAssetsDir: '',
    }
    meta.hcRoot = (await fsDriver.makeOrGetDir('HomeCloud', '/')).id;
    meta.thumbsDir = (await fsDriver.makeOrGetDir('Thumbs', meta.hcRoot)).id;
    meta.photosDir = (await fsDriver.makeOrGetDir('Photos', meta.hcRoot)).id;
    meta.photosAssetsDir = (await fsDriver.makeOrGetDir('Assets', meta.photosDir)).id;

    const storageMeta = await StorageMeta.createOrUpdate(storage, meta);
    return storageMeta;
}

export async function scan(fsDriver: FsDriver, force = false) {
    const storage = fsDriver.storage;
    let storageMeta = await storage.getStorageMeta();

    if (!storageMeta || force) {
        storageMeta = await setup(fsDriver);
    }
    return storageMeta;
}

export async function toggleService(storageMeta: StorageMeta, appName: string, enable: boolean) {
    switch (appName) {
        case 'photos':
            storageMeta.isPhotosEnabled = enable;
            break;
        default:
            throw new Error(`Unknown service ${appName}`);
    }
    await storageMeta.save();
}
