import { Sequelize, Op, DataTypes, Model, ModelAttributes, ModelIndexesOptions } from "sequelize";
import {
  envConfig,
  OptionalType,
  StorageType,
  StorageTypes,
  StorageAuthType,
  StorageAuthTypes,
  StorageTypeMeta,
  AccessControl,
} from "./envConfig";
import bcrypt from "bcrypt";
import {
  validateUsernameString,
  validatePasswordString,
  validateNameString,
  validateAccessControl,
} from "./utils/profileUtils";
import { createHash } from "./utils";
import CustomError from "./customError";
import path from "path";
import { getLibraryDirForProfile, setupLibraryForProfile } from "./utils/libraryUtils";
import { getDefaultDirectoriesCached } from "./utils/deviceInfo";

const saltRounds = 10;
const DAYS_5 = 5 * 24 * 60 * 60 * 1000;

class DbModel extends Model {
  static _columns: ModelAttributes;
  static _indexes?: ModelIndexesOptions[];
  static _db: Sequelize;

  get json() {
    return this.toJSON();
  }

  static register(db: Sequelize) {
    this._db = db;
    const opts: any = { sequelize: db };
    if (this._indexes) opts.indexes = this._indexes;
    super.init(this._columns, opts);
  }
}

export type ProfileDetails = {
  id: number;
  username: string | null;
  name: string;
  isAdmin: boolean;
  isPasswordProtected: boolean;
  isDisabled: boolean;
  accessControl?: AccessControl | null;
}

export class Profile extends DbModel {
  declare id: number;
  declare username: string | null;
  declare name: string;
  declare isAdmin: boolean;
  declare hash: string | null;
  declare isDisabled: boolean;
  declare accessControl: string | null;
  declare getStorages: () => Promise<Storage[]>;
  declare _photosNextId: number; // Do not use directly, use provisionPhotoIds

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      validate: {
        isLowercase: true,
        notEmpty: true,
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    hash: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    isDisabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    accessControl: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    _photosNextId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    }
  };

  getDetails(full = false): ProfileDetails {
    const details: ProfileDetails = {
      id: this.id,
      username: this.username,
      name: this.name,
      isAdmin: this.isAdmin,
      isPasswordProtected: this.isPasswordProtected(),
      isDisabled: this.isDisabled,
    };
    if (full) {
      details.accessControl = this.getAccessControl();
    }
    return details;
  }

  async validatePassword(password: string) {
    if (!this.isPasswordProtected()) return true;
    if (!password) return false;
    return bcrypt.compare(password, this.hash);
  }

  isPasswordProtected() {
    return !!this.hash;
  }

  getStorageById(id: number) {
    return Storage.findOne({ where: { id, ProfileId: this.id } });
  }

  del() {
    return this.destroy();
  }

  getAccessControl(): AccessControl | null {
    if (!this.accessControl) return null;
    return Profile.parseAccessControl(this.accessControl);
  }

  static parseAccessControl(str: string): AccessControl {
    return JSON.parse(str);
  }

  static stringifyAccessControl(accessControl: AccessControl) {
    const data = {};
    for (let [key, value] of Object.entries(accessControl)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw CustomError.validationSingle("accessControl", "Invalid JSON format.");
      }
      key = key.trim();
      value = value.trim();
      if (key.length === 0 || value.length === 0) {
        throw CustomError.validationSingle("accessControl", "Illegal string found.");
      }
      if (value.endsWith(path.sep)) {
        value = value.slice(0, -1);
      }
      data[key] = value;
    }
    return JSON.stringify(data);
  }

  static async getProfileByUsername(username: string) {
    return Profile.findOne({ where: { username } });
  }

  static async getProfileById(id: number) {
    return Profile.findByPk(id);
  }

  static async getProfiles(offset: number, limit: number) {
    return Profile.findAll({ offset, limit });
  }

  static async countProfiles() {
    return Profile.count();
  }

  static async provisionPhotoIds(profile: Profile, count: number = 1): Promise<number> {
    const transaction = await this._db.transaction();
    try {
      // Reload the profile with a lock to prevent race conditions
      profile = await Profile.findOne({ where: { id: profile.id }, lock: true, transaction });
      const nextId = profile._photosNextId;
      await profile.increment("_photosNextId", { by: count, transaction });
      await transaction.commit();
      return nextId;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async provisionPhotoIdsWithRetry(profile: Profile, count: number = 1, retries = 6): Promise<number> {
    let nextId: number = 0;
    for (let i = 0; i < retries; i++) {
      try {
        nextId = await Profile.provisionPhotoIds(profile, count);
        break;
      } catch (e) {
        console.error("provisionPhotoIdsWithRetry error:", e);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!nextId) {
      throw new Error("Failed to provision photo ids");
    }
    return nextId;
  }

  static provisionPhotoIdQueue: { [profileId: number]: { queue: { resolve: (value: number | PromiseLike<number>) => void, reject: (reason?: any) => void, count: number }[], timer: NodeJS.Timeout | null } } = {};

  static async provisionPhotoIdsBatched(profile: Profile, count: number = 1): Promise<number> {
    const q = Profile.provisionPhotoIdQueue[profile.id];
    if (!q) {
      Profile.provisionPhotoIdQueue[profile.id] = {
        queue: [],
        timer: null,
      };
    }
    const queue = Profile.provisionPhotoIdQueue[profile.id].queue;
    const timer = Profile.provisionPhotoIdQueue[profile.id].timer;
    const promise = new Promise<number>((resolve, reject) => {
      queue.push({ resolve, reject, count });
    });
    if (!timer || queue.length < 6) {
      // Delaying the provisioning a bit longer to wait for more requests to process together.
      timer && clearTimeout(timer);
      Profile.provisionPhotoIdQueue[profile.id].timer = setTimeout(() => {
        const queue = Profile.provisionPhotoIdQueue[profile.id].queue;
        const totalCount = queue.reduce((acc, item) => acc + item.count, 0);
        //console.log("provisionPhotoIdsBatched", profile.id, queue, totalCount);
        Profile.provisionPhotoIdQueue[profile.id].timer = null;
        Profile.provisionPhotoIdsWithRetry(profile, totalCount).then((nextId) => {
          queue.forEach((item) => {
            item.resolve(nextId);
            nextId += item.count;
          });
        }).catch((e) => {
          queue.forEach((item) => item.reject(e));
        });
        Profile.provisionPhotoIdQueue[profile.id].queue = [];
      }, 100);
    }
    return promise;
  }

  static async createProfile(
    {
      username,
      name,
      password = null,
      accessControl = null,
      isAdmin = false,
    }:
      {
        username: string | null,
        name: string,
        password: string | null,
        accessControl: AccessControl | null,
        isAdmin: boolean,
      },
    referalProfile: Profile | null
  ) {
    let hash: string | null = null;
    const isAdminInitiated = referalProfile === null || referalProfile.isAdmin;
    if (!isAdminInitiated) {
      throw CustomError.security("Only admin can create profiles");
    }
    if (
      !password &&
      envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Required
    ) {
      throw CustomError.validationSingle("password", "Password is required");
    }
    if (envConfig.PROFILES_CONFIG.requireUsername && !username) {
      throw CustomError.validationSingle("username", "Username is required");
    }

    name = validateNameString(name);

    if (!!username) {
      username = validateUsernameString(username);
    } else {
      username = null;
    }

    if (!!password) {
      if (envConfig.PROFILES_CONFIG.passwordPolicy === OptionalType.Disabled) {
        throw CustomError.validationSingle(
          "password",
          "Passwords are disabled",
        );
      }
      password = validatePasswordString(password);
      hash = await bcrypt.hash(password, saltRounds);
    }

    isAdmin =
      envConfig.PROFILES_CONFIG.adminIsDefault ||
      (await Profile.countProfiles()) === 0;

    let accessControlStr: string | null = null;
    if (accessControl) {
      accessControl = await validateAccessControl(accessControl);
      accessControlStr = Profile.stringifyAccessControl(accessControl);
    }

    // Todo: add access control json validation
    const profile = await Profile.create({ username, name, hash, isAdmin, accessControl: accessControlStr });

    // Create the local storage
    const localStorage_ = await Storage.createStorage(profile, {
      type: StorageType.Local,
      name: "This Device",
      authType: StorageAuthType.None,
      oneAuthId: null,
      username: null,
      secret: null,
      url: null,
      Agent: null,
    });

    await setupLibraryForProfile(profile.id);
    // Not awaiting this as it can be done in the background
    PinnedFolders.createDefaultPins(localStorage_);
    return profile;
  }

  async edit(data: {
    username?: string;
    name?: string;
    password?: string;
    isDisabled?: boolean;
    accessControl?: AccessControl | null;
    isAdmin?: boolean;
  },
    referalProfile: Profile | null
  ) {
    const isAdminInitiated = referalProfile === null || referalProfile.isAdmin;
    const isSelfInitiated = referalProfile.id === this.id;
    if (!isAdminInitiated && !isSelfInitiated) {
      throw CustomError.security("Admin access required.");
    }

    if (data.password && envConfig.PROFILES_CONFIG.passwordPolicy !== OptionalType.Disabled) {
      data.password = validatePasswordString(data.password);
      this.hash = await bcrypt.hash(data.password, saltRounds);
    }
    if (data.name) this.name = validateNameString(data.name);
    if (data.username && isAdminInitiated) this.username = validateUsernameString(data.username);
    if (data.isDisabled !== undefined && isAdminInitiated && !envConfig.PROFILES_CONFIG.singleProfile) this.isDisabled = data.isDisabled;

    if (data.accessControl !== undefined && isAdminInitiated) {
      data.accessControl = await validateAccessControl(data.accessControl);
      this.accessControl = Profile.stringifyAccessControl(data.accessControl);
    }

    if (data.isAdmin !== undefined && isAdminInitiated && !envConfig.PROFILES_CONFIG.singleProfile) {
      this.isAdmin = data.isAdmin;
    }

    return this.save();
  }

  async getLocalStorage() {
    return Storage.findOne({ where: { ProfileId: this.id, type: StorageType.Local } });
  }

  static async deleteProfiles(ids: number[], referalProfile: Profile | null) {

    if (envConfig.PROFILES_CONFIG.singleProfile) {
      throw CustomError.security("Cannot delete profiles on this device.");
    }

    const isAdminInitiated = referalProfile === null || referalProfile.isAdmin;
    if (!isAdminInitiated) {
      throw CustomError.security("Only admin can delete profiles");
    }
    return Profile.destroy({ where: { id: ids } });
  }

  static async getFirstProfile() {
    return Profile.findOne();
  }
}

export type AgentDetails = {
  id: number;
  fingerprint: string;
  remoteProfileId: number;
  deviceName: string;
  remoteProfileName: string;
  lastSeen: Date;
  authority: string;
  allowClientAccess: boolean;
  profileId: number;
  iconKey: string | null;
}

// Used both to represent client and target agents
export class Agent extends DbModel {
  declare id: number;
  declare fingerprint: string;
  declare remoteProfileId: number;
  declare deviceName: string;
  declare remoteProfileName: string;
  declare lastSeen: Date;
  declare authority: string | null; // hostname:port
  declare ProfileId: number;
  declare allowClientAccess: boolean | null;
  declare iconKey: string | null;
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;
  declare getStorage: () => Promise<Storage>;
  declare setStorage: (storage: Storage) => Promise<void>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['fingerprint', 'remoteProfileId', 'ProfileId'] },
  ];

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    fingerprint: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    remoteProfileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    deviceName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    remoteProfileName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    lastSeen: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    authority: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    allowClientAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    },
    iconKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  };

  hasClientAccess() {
    return this.allowClientAccess === true;
  }

  // Is client access explicitly blocked by the user
  clientAccessDisabled() {
    return this.allowClientAccess === false;
  }

  getDetails(): AgentDetails {
    return {
      id: this.id,
      fingerprint: this.fingerprint,
      remoteProfileId: this.remoteProfileId,
      deviceName: this.deviceName,
      remoteProfileName: this.remoteProfileName,
      lastSeen: this.lastSeen,
      authority: this.authority,
      allowClientAccess: this.allowClientAccess,
      profileId: this.ProfileId,
      iconKey: this.iconKey,
    };
  }

  static async getAgentById(id: number) {
    return Agent.findByPk(id);
  }

  static async getAgent(profile: Profile, fingerprint: string, remoteProfileId: number): Promise<Agent | null> {
    return Agent.findOne({ where: { fingerprint, remoteProfileId, ProfileId: profile.id } });
  }

  static async getClientAgents(profile: Profile) {
    return Agent.findAll({ where: { ProfileId: profile.id, allowClientAccess: true } });
  }

  static async createAgent(profile: Profile, {
    fingerprint,
    remoteProfileId,
    deviceName,
    remoteProfileName,
    authority,
    allowClientAccess,
    iconKey,
  }: {
    fingerprint: string;
    remoteProfileId: number;
    deviceName: string;
    remoteProfileName: string;
    authority: string;
    allowClientAccess?: boolean;
    iconKey?: string;
  }) {
    const lastSeen = new Date();

    const existing = await Agent.getAgent(profile, fingerprint, remoteProfileId);

    if (existing) {
      existing.deviceName = deviceName;
      existing.remoteProfileName = remoteProfileName;
      existing.lastSeen = lastSeen;
      existing.authority = authority;
      existing.iconKey = iconKey || null;
      if (allowClientAccess !== undefined) existing.allowClientAccess = allowClientAccess;
      return existing.save();
    }

    const agent = await Agent.create({
      fingerprint,
      remoteProfileId,
      deviceName,
      remoteProfileName,
      lastSeen,
      authority,
      iconKey: iconKey || null,
      allowClientAccess: allowClientAccess || null,
    });
    await agent.setProfile(profile);
    return agent;
  }

  async updateLastSeen() {
    this.lastSeen = new Date();
    return this.save();
  }

  async del() {
    return this.destroy();
  }

  async update({
    deviceName,
    remoteProfileName,
    authority,
    allowClientAccess,
  }: {
    deviceName?: string;
    remoteProfileName?: string;
    authority?: string | null;
    allowClientAccess?: boolean;
  }) {
    deviceName && (this.deviceName = deviceName);
    remoteProfileName && (this.remoteProfileName = remoteProfileName);
    authority !== undefined && (this.authority = authority);
    allowClientAccess !== undefined && (this.allowClientAccess = allowClientAccess);
    return this.save();
  }
}

export type CreateStorageType = {
  type: StorageType;
  name: string;
  authType: StorageAuthType;
  oneAuthId: string | null;
  username: string | null;
  secret: string | null;
  url: string | null;
  Agent?: Agent | null;
};

export type EditStorageType = {
  authType?: StorageAuthType;
  name?: string;
  username?: string;
  secret?: string;
  url?: string;
};

export class Storage extends DbModel {
  declare id: number;
  declare name: string;
  declare type: StorageType;
  declare oneAuthId: string | null;
  declare username: string | null;
  declare url: string | null;
  declare secret: string | null;
  declare accessToken: string | null;
  declare accessTokenExpiresOn: Date | null;
  declare authType: StorageAuthType;
  declare ProfileId: number;
  declare AgentId: number | null;
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;
  declare setAgent: (agent: Agent) => Promise<void>;
  declare getAgent: () => Promise<Agent>;

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    oneAuthId: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true,
      },
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: false,
      },
      get(this: Storage): string | null {
        // todo: decrypt secret here
        return this.getDataValue("secret");
      },
      set(this: Storage, value: string | null) {
        // todo: encrypt secret here
        this.setDataValue("secret", value);
      },
    },
    accessToken: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: false,
      },
    },
    accessTokenExpiresOn: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    authType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
  };

  async getDetails() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      authType: this.authType,
      url: this.url,
      username: this.username,
      oneAuthId: this.oneAuthId,
      agent: this.AgentId ? (await this.getAgent()).getDetails() : null,
    };
  }

  isAgentType() {
    return this.type === StorageType.Agent;
  }

  async delete() {
    if (this.type === StorageType.Local) {
      const localStorageCount = await Storage.count({ where: { ProfileId: this.ProfileId, type: StorageType.Local } });
      if (localStorageCount === 1) {
        throw new Error("Cannot delete the only local storage for this profile");
      }
    }
    return this.destroy();
  }

  static async validateData(data: CreateStorageType) {
    if (!data.name) throw new Error("Name is required");
    if (!data.type || !StorageTypes.includes(data.type))
      throw new Error("Invalid storage type");
    if (!data.authType || !StorageAuthTypes.includes(data.authType))
      throw new Error("Invalid auth type");

    data.name = data.name.trim();
    data.url = data.url ? data.url.trim() : null;
    data.username = data.username ? data.username.trim() : null;
    data.secret = data.secret ? data.secret.trim() : null;
    data.oneAuthId = data.oneAuthId ? data.oneAuthId.trim() : null;

    if (data.name.length < 3)
      throw new Error("Name must be at least 3 characters long");
    if (StorageTypeMeta[data.type].urlRequired && !data.url)
      throw new Error("Url is required");

    const allowedAuthTypes = StorageTypeMeta[data.type].allowedAuthTypes;
    if (allowedAuthTypes && !allowedAuthTypes.includes(data.authType)) {
      throw new Error("Invalid auth type for this storage type");
    }

    const allowedUrlProtocols = StorageTypeMeta[data.type].allowedUrlProtocols;
    if (allowedUrlProtocols && data.url) {
      const protocol = data.url.split("://")[0];
      if (!allowedUrlProtocols.includes(protocol)) {
        throw new Error("Invalid url protocol for this storage type");
      }
    }

    switch (data.authType) {
      case StorageAuthType.OneAuth:
        if (!data.oneAuthId)
          throw new Error("oneAuthId is required for oneauth");
        data.url = null;
        data.username = null;
        break;
      case StorageAuthType.None:
        data.username = null;
        data.secret = null;
        data.oneAuthId = null;
        break;
      case StorageAuthType.Basic:
        if (!data.username || !data.username.length)
          throw new Error("Username is required for basic auth");
        if (!data.secret)
          throw new Error("Password is required for basic auth");
        data.oneAuthId = null;
        break;
      case StorageAuthType.Digest:
        if (!data.username || !data.username.length)
          throw new Error("Username is required for digest auth");
        if (!data.secret)
          throw new Error("Password is required for digest auth");
        data.oneAuthId = null;
      case StorageAuthType.Pairing:
        if (data.type !== StorageType.Agent) throw new Error("Pairing auth is only allowed for agent storage");
        if (!data.Agent) throw new Error("Paired agent is required for pairing auth");
        data.oneAuthId = null;
        data.username = null;
        data.url = null;
        if (!data.secret) throw new Error("Secret is required for pairing auth");
        break;
    }

    if (data.type !== StorageType.Agent) {
      data.Agent = null;
    }

    if (data.type === StorageType.Local) {
      data.url = null;
    }

    return data;
  }

  async setAccessToken({
    accessToken,
    expiresOn,
  }: {
    accessToken: string;
    expiresOn: Date;
  }) {
    if (this.authType !== StorageAuthType.OneAuth)
      throw new Error("Cannot set access token for non oneauth storage");
    this.accessToken = accessToken;
    this.accessTokenExpiresOn = expiresOn;
    return this.save();
  }

  hasActiveAccessToken() {
    if (this.authType !== StorageAuthType.OneAuth)
      throw new Error("Cannot check access token for non oneauth storage");
    if (!this.accessToken || !this.accessTokenExpiresOn) return false;
    return this.accessTokenExpiresOn > new Date();
  }

  async edit({ authType, name, username, secret, url }: EditStorageType) {
    this.name = name || this.name;
    this.username = username || this.username;
    this.secret = secret || this.secret;
    this.url = url || this.url;

    if (authType) {
      if (
        this.authType !== StorageAuthType.OneAuth &&
        authType === StorageAuthType.OneAuth
      ) {
        throw new Error("Cannot change auth type to oneauth");
      }
      if (
        this.authType === StorageAuthType.OneAuth &&
        authType !== StorageAuthType.OneAuth
      ) {
        throw new Error("Cannot change auth type from oneauth");
      }
      if (!StorageAuthTypes.includes(authType))
        throw new Error("Invalid auth type");
      this.authType = authType;
    }

    const data = await Storage.validateData({
      type: this.type,
      name: this.name,
      authType: this.authType,
      oneAuthId: this.oneAuthId,
      username: this.username,
      secret: this.secret,
      url: this.url,
      Agent: await this.getAgent(),
    });

    this.name = data.name;
    this.username = data.username;
    this.secret = data.secret;
    this.url = data.url;
    this.oneAuthId = data.oneAuthId;

    const existing = await Storage.getExisting({
      profile: await this.getProfile(),
      authType: this.authType,
      username: this.username,
      url: this.url,
      oneAuthId: this.oneAuthId,
      storageType: this.type,
      Agent: await this.getAgent(),
    });
    if (existing && existing.id !== this.id) {
      throw new Error("Storage with same configuration already exists for this profile");
    }
    return this.save();
  }

  static async getExisting({
    profile,
    authType,
    username,
    url,
    oneAuthId,
    storageType,
    Agent,
  }: {
    profile: Profile;
    authType: StorageAuthType;
    username: string | null;
    url: string | null;
    oneAuthId: string | null;
    storageType: StorageType;
    Agent?: Agent;
  }) {
    const where: any = { ProfileId: profile.id };
    if (authType === StorageAuthType.OneAuth) {
      if (!oneAuthId) throw new Error("oneAuthId is required");
      where.oneAuthId = oneAuthId;
      return await this.findOne({ where });
    }
    else if (storageType === StorageType.Local) {
      where.type = storageType;
      return await this.findOne({ where }); // only one local storage per profile allowed
    }
    else if (storageType === StorageType.Agent) {
      if (!Agent) throw new Error("(getExisting) Agent is required for agent storage");
      where.AgentId = Agent.id;
      return await this.findOne({ where });
    }
    else {
      if (!url) throw new Error("url is required");
      where.url = url;
      where.username = username;
      return await this.findOne({ where });
    }
  }

  static async createStorage(profile: Profile, data: CreateStorageType) {
    if (!profile) throw new Error("Profile is required to create storage");
    await Storage.validateData(data);

    const existing = await Storage.getExisting({
      profile,
      authType: data.authType,
      username: data.username,
      url: data.url,
      oneAuthId: data.oneAuthId,
      Agent: data.Agent,
      storageType: data.type,
    });
    if (existing) {
      if (data.authType !== StorageAuthType.OneAuth && data.authType !== StorageAuthType.Pairing) {
        throw new Error("Storage with target already exists for this profile");
      }
      existing.secret = data.secret;
      return existing.save();
    }
    const storage = await Storage.create(data);
    await storage.setProfile(profile);
    if (data.Agent) {
      await storage.setAgent(data.Agent);
    }
    return storage;
  }

  static async getById(id: number) {
    return Storage.findByPk(id);
  }

  static async getStoragesForProfile(profile: Profile, storageIds: number[], onlyIds = false) {
    const storages = await Storage.findAll({
      where: { id: storageIds, profile },
      include: {
        attributes: onlyIds ? ["id"] : undefined
      }
    });
    return storages;
  }
}

export class PendingAuth extends DbModel {
  declare id: number;
  declare referenceId: string;
  declare partialCode1: string;
  declare storageType: StorageType;
  declare expiresOn: Date;
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['referenceId', 'ProfileId'] }
  ];

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    referenceId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    partialCode1: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    storageType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    expiresOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  };

  getDetails() {
    return {
      id: this.id,
      referenceId: this.referenceId,
      storageType: this.storageType,
      expiresOn: this.expiresOn,
    };
  }

  makeSecret(partialCode2: string) {
    return createHash(this.partialCode1 + partialCode2);
  }

  async createStorage({
    oneAuthId,
    partialCode2,
  }: {
    oneAuthId: string;
    partialCode2: string;
  }) {
    const profile = await this.getProfile();
    if (!profile) throw new Error("Profile not found");
    const secret = this.makeSecret(partialCode2);
    const storage = await Storage.createStorage(profile, {
      type: this.storageType,
      name: StorageTypeMeta[this.storageType].name,
      authType: StorageAuthType.OneAuth,
      oneAuthId,
      secret,
      url: null,
      username: null,
      Agent: null,
    });
    await this.destroy();
    return storage;
  }

  static async createPendingAuth({
    profile,
    storageType,
    referenceId,
    partialCode1,
  }: {
    profile: Profile;
    storageType: StorageType;
    referenceId: string;
    partialCode1: string;
  }) {
    const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
    const pendingAuth = await PendingAuth.create({
      storageType,
      referenceId,
      expiresOn,
      partialCode1,
    });
    await pendingAuth.setProfile(profile);
    return pendingAuth;
  }

  static async getByReferenceId(referenceId: string) {
    return PendingAuth.findOne({ where: { referenceId } });
  }

  static async clearExpired() {
    return PendingAuth.destroy({
      where: { expiresOn: { [Op.lt]: new Date() } },
    });
  }
}

export class Photo extends DbModel {
  declare setProfile: (profile: Profile) => Promise<void>;
  declare getProfile: () => Promise<Profile>;
  declare itemId: number;
  declare folderNo: number;
  declare fileId: string;
  declare mimeType: string;
  declare capturedOn: Date;
  declare lastEditedOn: Date;
  declare addedOn: Date;
  declare size: number;
  declare duration: number | null;
  declare height: number;
  declare width: number;
  declare originDevice: string | null;
  declare metadata: string | null;
  declare ProfileId: number;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['itemId', 'ProfileId'] }
  ];

  static _columns: ModelAttributes = {
    itemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    folderNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    capturedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    lastEditedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    addedOn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    originDevice: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  };

  getDetails() {
    return this.toJSON();
  }

  getMinDetails() {
    return {
      itemId: this.itemId,
      folderNo: this.folderNo,
      fileId: this.fileId,
      mimeType: this.mimeType,
      capturedOn: this.capturedOn,
      addedOn: this.addedOn,
      duration: this.duration,
      height: this.height,
      width: this.width,
    };
  }

  static async getPhoto(itemId: number, profile: Profile) {
    return Photo.findOne({ where: { itemId, ProfileId: profile.id } });
  }

  static async getPhotosByIds(itemIds: number[], profile: Profile) {
    return Photo.findAll({ where: { itemId: itemIds, ProfileId: profile.id } });
  }

  static async updateBulk(
    updates: { [itemId: number]: any },
    profile: Profile,
  ): Promise<Photo[]> {
    const promises: Promise<[affectedCount: number, affectedRows: Photo[]]>[] = [];
    for (const itemId of Object.keys(updates).map((id) => parseInt(id))) {
      const update = updates[itemId];
      if (update.ProfileId) delete update.ProfileId;
      if (update.itemId) delete update.itemId;
      if (update.folderNo) delete update.folderNo;
      if (update.addedOn) delete update.addedOn;
      promises.push(
        Photo.update(update, { where: { itemId, ProfileId: profile.id }, returning: true }),
      );
    }
    const resp = await Promise.all(promises);
    return resp.map(([, photos]) => photos[0]);
  }

  static async deletePhotos(itemIds: number[], profile: Profile) {
    return Photo.destroy({ where: { itemId: itemIds, ProfileId: profile.id } });
  }

  static async deleteAllPhotos(profile: Profile) {
    return Photo.destroy({ where: { ProfileId: profile.id } });
  }

  static async getPhotos(profile: Profile, { offset, limit, sortBy, ascending = true }: getPhotosParams): Promise<Photo[]> {
    return Photo.findAll({
      where: { ProfileId: profile.id },
      offset,
      limit,
      order: [[sortBy, ascending ? "ASC" : "DESC"]],
    });
  }

  static async createPhotosBulk(items: createPhotoType[], profile: Profile): Promise<Photo[]> {
    items = items.map((item) => {
      return { ...item, ProfileId: profile.id };
    });
    return Photo.bulkCreate(items);
  }
}

export type getPhotosParams = {
  offset: number,
  limit: number,
  sortBy: string,
  ascending: boolean,
};

export type createPhotoType = {
  itemId: number;
  folderNo: number;
  fileId: string;
  mimeType: string;
  capturedOn: Date;
  lastEditedOn: Date;
  addedOn: Date;
  size: number;
  duration: number | null;
  height: number | null;
  width: number | null;
  originDevice: string | null;
  metadata: string | null;
};

export type ThumbDetails = {
  fileId: string;
  updatedAt: Date;
  image: string;
  height: number;
  width: number;
}

export class Thumb extends DbModel {
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;
  declare fileId: string;
  declare mimeType: string;
  declare updatedAt: Date;
  declare height: number | null;
  declare width: number | null;
  declare image: string;
  declare lastReadOn: Date;
  declare StorageId: number;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['fileId', 'StorageId'] }
  ];

  static _columns: ModelAttributes = {
    fileId: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lastReadOn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  };

  getDetails(): ThumbDetails {
    return {
      fileId: this.fileId,
      updatedAt: this.updatedAt,
      image: this.image,
      height: this.height,
      width: this.width,
    };
  }

  isUpToDate(fileLastModified: Date) {
    return this.updatedAt >= fileLastModified;
  }

  async updateThumb({
    mimeType,
    height,
    width,
    image,
  }: {
    mimeType?: string;
    height?: number | null;
    width?: number | null;
    image: string;
  }) {
    this.mimeType = mimeType || this.mimeType;
    this.height = height || this.height;
    this.width = width || this.width;
    this.image = image;
    this.lastReadOn = new Date();
    return this.save();
  }

  static async getThumb(fileId: string, storage: Storage) {
    const thumb = await Thumb.findOne({
      where: { fileId, StorageId: storage.id },
    });
    if (!thumb) return null;
    thumb.lastReadOn = new Date();
    thumb.save(); // not waiting for save to complete
    return thumb;
  }

  static async createThumb(
    {
      fileId,
      mimeType,
      height,
      width,
      image,
    }: {
      fileId: string;
      mimeType: string;
      height: number | null;
      width: number | null;
      image: string;
    },
    storage: Storage,
  ) {
    return Thumb.create({
      fileId,
      mimeType,
      height,
      width,
      image,
      StorageId: storage.id,
    });
  }

  static async deleteThumbs(fileIds: string[], storage: Storage) {
    return Thumb.destroy({ where: { fileId: fileIds, StorageId: storage.id } });
  }

  static async removeOldThumbs() {
    const now = new Date();
    const expired = new Date(now.getTime() - DAYS_5 * 4); // 20 days
    return Thumb.destroy({ where: { lastReadOn: { [Op.lt]: expired } } });
  }
}

export class PinnedFolders extends DbModel {
  declare id: number;
  declare folderId: string;
  declare name: string;
  declare StorageId: number;
  declare setStorage: (storage: Storage) => Promise<void>;
  declare getStorage: () => Promise<Storage>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['folderId', 'StorageId'] }
  ];

  static _columns: ModelAttributes = {
    folderId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  };

  getDetails() {
    return {
      id: this.id,
      folderId: this.folderId,
      name: this.name,
    };
  }

  static async getPinnedFolders(storages: Storage[]) {
    return PinnedFolders.findAll({
      where: { StorageId: storages.map((s) => s.id) },
    });
  }

  static async addPinnedFolder(
    storage: Storage,
    folderId: string,
    name: string,
  ) {
    const existing = await PinnedFolders.findOne({
      where: { folderId, StorageId: storage.id },
    });
    if (existing) {
      existing.name = name;
      return existing.save();
    }
    return PinnedFolders.create({ folderId, name, StorageId: storage.id });
  }

  static async removePinnedFolder(storage: Storage, folderId: string) {
    return PinnedFolders.destroy({
      where: { folderId, StorageId: storage.id },
    });
  }

  static async createDefaultPins(storage: Storage) {
    if (storage.type !== StorageType.Local) return;

    const defaultFolders = getDefaultDirectoriesCached();
    const promises = Object.keys(defaultFolders).map(async (folderName) => {
      if (!defaultFolders[folderName]) return;
      await PinnedFolders.addPinnedFolder(storage, defaultFolders[folderName], folderName);
    });
    await Promise.all(promises);
  }
}

export function initModels(db: Sequelize) {
  const classes = [
    Profile,
    Storage,
    PendingAuth,
    Photo,
    Thumb,
    PinnedFolders,
    Agent,
  ];
  for (const cls of classes) {
    cls.register(db);
  }

  Profile.hasMany(Storage, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Storage.belongsTo(Profile);

  Profile.hasMany(Agent, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Agent.belongsTo(Profile);

  Agent.hasOne(Storage, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Storage.belongsTo(Agent);

  Profile.hasMany(PendingAuth, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  PendingAuth.belongsTo(Profile);

  Profile.hasMany(Photo, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Photo.belongsTo(Profile);

  Storage.hasMany(Thumb, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Thumb.belongsTo(Storage);

  Storage.hasMany(PinnedFolders, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  PinnedFolders.belongsTo(Storage);
}
