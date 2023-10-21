import { Storage } from "../models";
import { FsDriver } from "../storageKit/interface";
import { ApiRequestFile } from "../interface";
import { jsonToStream, streamToJson } from "../utils";
import { getToday } from "../utils";

function searchStartIndex(arr: any[], key: string, val: any) {
  let start = 0;
  let end = arr.length - 1;

  if (arr[start][key] > val) {
    return start;
  }

  if (arr[end][key] <= val) {
    return -1;
  }

  while (start < end) {
    let mid = Math.floor((start + end) / 2);

    if (val < arr[mid][key]) {
      end = mid;
    } else {
      start = mid + 1;
    }
  }
  return end;
}

function get5minsAgo() {
  return getToday() - 5 * 60 * 1000;
}

export type HeadFileType = {
  lastChangeTime: number;
  lastPurgeTime: number;
  nextItemId: number;
};

export type ActionType = {
  time: number;
  type: "add" | "delete" | "update";
  itemId: number;
  data: any;
};

export type SimpleActionSetType = {
  add: { [itemId: number]: any };
  delete: number[];
  update: { [itemId: number]: any };
};

export type ChangeLogType = {
  lastUpdateTime: number;
  actions: ActionType[];
};

export type ArchiveType = {
  lastUpdateTime: number;
  items: { [itemId: number]: any };
};

export default abstract class SyncEngine {
  fsDriver: FsDriver;
  storage: Storage;
  parentDirId: string;
  fileIds: { [key: string]: string } = {};
  files: { [key: string]: any } = {};
  isSoftSynced: boolean = false;
  newActions: ActionType[] = [];
  lockTimer: NodeJS.Timer | null = null;
  lockTime: number | null = null;
  lockStartTime: number | null = null;

  constructor(fsDriver: FsDriver, parentDirId: string) {
    this.fsDriver = fsDriver;
    this.storage = fsDriver.storage;
    this.parentDirId = parentDirId;
  }

  public isLocked() {
    return this.lockTime !== null && this.lockTime > get5minsAgo();
  }

  public async aquireLock() {
    if (this.lockTimer || this.lockTime !== null) {
      throw new Error("Lock already aquired");
    }
    this.lockTime = await this.getsyncLockTime();
    if (this.lockTime !== null && this.lockTime > get5minsAgo()) {
      throw new Error(`Lock already aquired at time: ${this.lockTime}`);
    }
    this.lockTime = getToday();
    await this.setSyncLockTime(this.lockTime);
    this.lockStartTime = this.lockTime;
    this.lockTimer = setInterval(async () => {
      if (this.lockStartTime && this.lockStartTime > new Date(this.lockStartTime).getTime() + 10 * 60 * 1000) {
        console.log('Lock time expired, clearing timer', this.lockStartTime);
        this.releaseLock();
        return;
      }
      const lockTime_ = await this.getsyncLockTime();
      if (lockTime_ !== null && lockTime_ > get5minsAgo() && lockTime_ === this.lockTime) {
        console.log('Sync lock refreshed', lockTime_);
        this.lockTime = getToday();
        await this.setSyncLockTime(this.lockTime);
      } else {
        console.log('Lost sync lock, clearing timer', lockTime_, this.lockTime);
        this.lockTimer && clearInterval(this.lockTimer);
      }
    }, 1 * 60 * 1000);
  }

  async releaseLock() {
    this.lockTimer && clearInterval(this.lockTimer);
    await this.setSyncLockTime(null);
    this.lockTime = null;
  }

  checkLock() {
    if (!this.isLocked()) {
      throw new Error(`Lock lost, last lock time: ${this.lockTime}, now: ${getToday()}`);
    }
  }

  public async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.aquireLock();
    try {
      const resp = await fn();
      // await new Promise((resolve) => setTimeout(resolve, 60 * 1000)); // debug
      this.releaseLock();
      return resp;
    } catch (e) {
      this.releaseLock();
      throw e;
    }
  }

  private getInitialFile(type: "head" | "changeLog" | "archive") {
    switch (type) {
      case "head":
        return {
          lastChangeTime: 0,
          lastPurgeTime: 0,
          nextItemId: 1,
        } as HeadFileType;
      case "changeLog":
        return {
          lastUpdateTime: 0,
          actions: [],
        } as ChangeLogType;
      case "archive":
        return {
          lastUpdateTime: 0,
          archive: [],
        };
      default:
        throw new Error(`Unknown file type ${type}`);
    }
  }

  private async getFileId(type: "head" | "changeLog" | "archive") {
    if (this.fileIds[type]) {
      return this.fileIds[type];
    }
    try {
      const stat = await this.fsDriver.getStatByFilename(
        `${type}.json`,
        this.parentDirId,
      );
      this.fileIds[type] = stat.id;
      return this.fileIds[type];
    } catch (e) {
      console.log("file json not found, creating one:", type);
      const fileContent = this.getInitialFile(type);
      const fileReq: ApiRequestFile = {
        name: `${type}.json`,
        mime: "application/json",
        stream: jsonToStream(fileContent),
      };
      const file = await this.fsDriver.writeFile(this.parentDirId, fileReq);
      this.fileIds[type] = file.id;
      this.files[type] = fileContent;
      return this.fileIds[type];
    }
  }

  private async getFile(type: "head" | "changeLog" | "archive") {
    console.log("getFile", type);
    const fileId = await this.getFileId(type);
    console.log("fileId", fileId);
    if (this.files[type]) {
      return this.files[type];
    }
    const [stream, mimeType] = await this.fsDriver.readFile(fileId);
    this.files[type] = await streamToJson(stream);
    return this.files[type];
  }

  private async saveFile(type: "head" | "changeLog" | "archive", data: any) {
    const fileReq: ApiRequestFile = {
      name: `${type}.json`,
      mime: "application/json",
      stream: jsonToStream(data),
    };
    const fileId = await this.getFileId(type);
    await this.fsDriver.updateFile(fileId, fileReq);
  }

  public async softSync() {
    const head = (await this.getFile("head")) as HeadFileType;
    const lastSyncTime = await this.getLastSyncTime();
    this.checkLock();
    console.log("lastSyncTime", lastSyncTime);
    console.log("head.lastChangeTime", head.lastChangeTime);
    if (head.lastChangeTime <= lastSyncTime) {
      this.isSoftSynced = true;
      return;
    }
    if (head.lastPurgeTime > lastSyncTime) {
      throw new Error("Purge happened after last sync, please hard sync");
    }
    const changeLog = (await this.getFile("changeLog")) as ChangeLogType;
    this.checkLock();
    const startInd = searchStartIndex(changeLog.actions, "time", lastSyncTime);
    console.log("startInd", startInd);
    if (startInd === -1) {
      throw new Error("Change log is corrupted");
    }
    const newActions = changeLog.actions.slice(startInd);
    const simpleActions = await this.applyActions(newActions);
    await this.setLastSyncTime(head.lastChangeTime);
    this.isSoftSynced = true;
    return simpleActions;
  }

  private async applyActions(newActions: ActionType[]) {
    const simpleActions = this.simplifyActions(newActions);
    const promises = [];
    if (simpleActions.delete.length > 0) {
      promises.push(this.deleteItemsFromDb(simpleActions.delete));
    }
    if (Object.keys(simpleActions.update).length > 0) {
      promises.push(this.updateItemsInDb(simpleActions.update));
    }
    if (Object.keys(simpleActions.add).length > 0) {
      promises.push(this.addItemsToDb(simpleActions.add));
    }
    await Promise.all(promises);
    return simpleActions;
  }

  private simplifyActions(
    actions: ActionType[],
    initalSet: SimpleActionSetType = {
      add: {},
      delete: [],
      update: {},
    },
  ): SimpleActionSetType {
    const add: { [itemId: number]: any } = initalSet.add;
    const delete_: number[] = initalSet.delete;
    const update: { [itemId: number]: any } = initalSet.update;
    for (const action of actions) {
      switch (action.type) {
        case "add":
          add[action.itemId] = action.data;
          break;
        case "delete":
          if (add[action.itemId]) {
            delete add[action.itemId];
          } else {
            delete_.push(action.itemId);
          }
          if (update[action.itemId]) {
            delete update[action.itemId];
          }
          break;
        case "update":
          if (add[action.itemId]) {
            add[action.itemId] = { ...add[action.itemId], ...action.data };
          } else if (update[action.itemId]) {
            update[action.itemId] = {
              ...update[action.itemId],
              ...action.data,
            };
          } else {
            update[action.itemId] = action.data;
          }
          break;
      }
    }
    return {
      add,
      delete: delete_,
      update,
    };
  }

  public async hardSync(force = false) {
    const head = (await this.getFile("head")) as HeadFileType;
    const getLastSyncTime = await this.getLastSyncTime();
    this.checkLock();
    if (head.lastPurgeTime <= getLastSyncTime && !force) {
      throw new Error(
        "Purge happened before last sync, cannot hard sync, please use soft sync",
      );
    }
    const archive = (await this.getFile("archive")) as ArchiveType;
    this.checkLock();
    await this.deleteAllItemsFromDb();
    await this.addItemsToDb(archive.items);
    await this.setLastSyncTime(head.lastPurgeTime);
    this.isSoftSynced = false;
  }

  public async applyNewActions() {
    const actions = this.newActions;
    if (!this.isSoftSynced) {
      throw new Error(
        "Cannot perform new actions, not synced",
      );
    }
    this.checkLock();
    console.log("applyNewActions", actions);
    const simpleActions = await this.applyActions(actions);
    this.checkLock();
    console.log("simpleActions", simpleActions);

    const changeLog = (await this.getFile("changeLog")) as ChangeLogType;
    this.checkLock();
    changeLog.actions.push(...actions);
    changeLog.lastUpdateTime = getToday();
    await this.saveFile("changeLog", changeLog);

    const head = (await this.getFile("head")) as HeadFileType;
    head.lastChangeTime = changeLog.lastUpdateTime;
    await this.saveFile("head", head);
    this.checkLock();

    this.setLastSyncTime(changeLog!.lastUpdateTime);
    this.newActions = [];
    return simpleActions;
  }

  public async getNextItemId() {
    const head = (await this.getFile("head")) as HeadFileType;
    return head.nextItemId;
  }

  public async addItems(items: { [itemId: number]: any }) {
    const head = (await this.getFile("head")) as HeadFileType;
    this.checkLock();
    let nextItemId = head.nextItemId;
    const actions: ActionType[] = [];
    const sortedItemIds = Object.keys(items).map(Number).sort();
    if (sortedItemIds.length === 0) {
      return actions;
    }
    if (sortedItemIds[0] < nextItemId) {
      throw new Error(
        "Could not add item, Item id already exists: " +
        sortedItemIds[0] +
        " < " +
        nextItemId,
      );
    }
    for (const itemId of sortedItemIds) {
      const item = items[itemId];
      actions.push({
        time: getToday(),
        type: "add",
        itemId,
        data: item,
      });
    }
    this.newActions.push(...actions);
    nextItemId = sortedItemIds[sortedItemIds.length - 1] + 1;
    head.nextItemId = nextItemId;
    return actions;
  }

  public async deleteItems(itemIds: number[]) {
    const actions: ActionType[] = [];
    for (const itemId of itemIds) {
      actions.push({
        time: getToday(),
        type: "delete",
        itemId,
        data: null,
      });
    }
    this.newActions.push(...actions);
    return actions;
  }

  public async updateItems(items: { [itemId: number]: any }) {
    const actions: ActionType[] = [];
    for (const itemId of Object.keys(items).map(Number)) {
      actions.push({
        time: getToday(),
        type: "update",
        itemId,
        data: items[itemId],
      });
    }
    this.newActions.push(...actions);
    return actions;
  }

  public async mergeSimpleActions(
    actions: ActionType[],
    simpleActions: SimpleActionSetType,
  ) {
    return this.simplifyActions(actions, simpleActions);
  }

  public async archiveChanges() {
    if (!this.isSoftSynced) {
      throw new Error("Cannot perform archive, not synced");
    }
    const archive = (await this.getFile("archive")) as ArchiveType;
    const changeLog = (await this.getFile("changeLog")) as ChangeLogType;
    const head = (await this.getFile("head")) as HeadFileType;
    this.checkLock();

    const simpleActions = this.simplifyActions(changeLog.actions);
    for (const itemId of simpleActions.delete) {
      delete archive.items[itemId];
    }
    for (const itemId of Object.keys(simpleActions.update).map(Number)) {
      archive.items[itemId] = {
        ...archive.items[itemId],
        ...simpleActions.update[itemId],
      };
    }
    archive.items = { ...archive.items, ...simpleActions.add };
    archive.lastUpdateTime = head.lastChangeTime;
    await this.saveFile("archive", archive);
    this.checkLock();

    const newChangeLog = this.getInitialFile("changeLog") as ChangeLogType;
    newChangeLog.lastUpdateTime = archive.lastUpdateTime;
    await this.saveFile("changeLog", newChangeLog);
    this.checkLock();

    head.lastPurgeTime = archive.lastUpdateTime;
    await this.saveFile("head", head);
    this.checkLock();
    return simpleActions;
  }

  abstract setLastSyncTime(time: number): Promise<void>;
  abstract getLastSyncTime(): Promise<number>;

  abstract getsyncLockTime(): Promise<number | null>;
  abstract setSyncLockTime(time: number | null): Promise<void>;

  abstract addItemsToDb(items: { [itemId: number]: any }): Promise<void>;
  abstract deleteItemsFromDb(itemIds: number[]): Promise<void>;
  abstract deleteAllItemsFromDb(): Promise<void>;
  abstract updateItemsInDb(items: { [itemId: number]: any }): Promise<void>;
}
