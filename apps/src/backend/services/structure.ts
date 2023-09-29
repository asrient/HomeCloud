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
    await storageMeta.updateLastScan();
    return storageMeta;
}

export async function scan(fsDriver: FsDriver, force = false) {
    const storage = fsDriver.storage;
    let storageMeta = await storage.getStorageMeta();

    if (!storageMeta || storageMeta?.scanRequired() || force) {
        storageMeta = await setup(fsDriver);
    }
    return storageMeta;
}
