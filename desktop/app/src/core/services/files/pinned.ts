import { Storage, PinnedFolders } from "../../models";

export async function listPinnedFolders(
  storageIds: number[],
) {
  return await PinnedFolders.findAll({
    where: {
      storageId: storageIds,
    },
    include: {
      model: Storage,
    },
  });
}

export async function addPinnedFolder(
  storage: Storage,
  folderId: string,
  name: string,
) {
  return await PinnedFolders.addPinnedFolder(storage, folderId, name);
}

export async function removePinnedFolder(storage: Storage, folderId: string) {
  return await PinnedFolders.removePinnedFolder(storage, folderId);
}
