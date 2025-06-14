import { Sequelize, Op, DataTypes, Model, ModelAttributes, ModelIndexesOptions } from "sequelize";
import {
  StorageType,
  StorageTypes,
  StorageAuthType,
  StorageAuthTypes,
  StorageTypeMeta,
} from "./envConfig";
import { createHash } from "./utils";
import { getDefaultDirectoriesCached } from "./utils/deviceInfo";

export class DbModel extends Model {
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

export type PhotoLibraryDetails = {
  id: number;
  name: string;
  location: string;
}

export class PhotoLibraryLocation extends DbModel {
  declare id: number;
  declare name: string;
  declare location: string;

  static _columns: ModelAttributes = {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    }
  };

  details(): PhotoLibraryDetails {
    return {
      id: this.id,
      name: this.name,
      location: this.location,
    };
  }

  static async addLocation(name: string, location: string) {
    const existing = await PhotoLibraryLocation.getLocation(location);
    if (existing) {
      existing.name = name;
      return existing.save();
    }
    return PhotoLibraryLocation.create({ name, location });
  }

  static async getLocations() {
    return PhotoLibraryLocation.findAll();
  }

  static async getLocationById(id: number) {
    return PhotoLibraryLocation.findByPk(id);
  }

  static async getLocation(location: string) {
    return PhotoLibraryLocation.findOne({ where: { location } });
  }

  static async removeLocation(id: number) {
    return PhotoLibraryLocation.destroy({ where: { id } });
  }
}

export type AgentDetails = {
  id: number;
  fingerprint: string;
  deviceName: string;
  lastSeen: Date;
  authority: string;
  allowClientAccess: boolean;
  iconKey: string | null;
}

// Used both to represent client and target agents
export class Agent extends DbModel {
  declare id: number;
  declare fingerprint: string;
  declare deviceName: string;
  declare lastSeen: Date;
  declare authority: string | null; // hostname:port
  declare allowClientAccess: boolean | null;
  declare iconKey: string | null;
  declare getStorage: () => Promise<Storage>;
  declare setStorage: (storage: Storage) => Promise<void>;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['fingerprint'] },
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
    deviceName: {
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
      deviceName: this.deviceName,
      lastSeen: this.lastSeen,
      authority: this.authority,
      allowClientAccess: this.allowClientAccess,
      iconKey: this.iconKey,
    };
  }

  static async getAgentById(id: number) {
    return Agent.findByPk(id);
  }

  static async getAgent(fingerprint: string): Promise<Agent | null> {
    return Agent.findOne({ where: { fingerprint } });
  }

  static async getClientAgents() {
    return Agent.findAll({ where: { allowClientAccess: true } });
  }

  static async createAgent({
    fingerprint,
    deviceName,
    authority,
    allowClientAccess,
    iconKey,
  }: {
    fingerprint: string;
    deviceName: string;
    authority: string;
    allowClientAccess?: boolean;
    iconKey?: string;
  }) {
    const lastSeen = new Date();

    const existing = await Agent.getAgent(fingerprint);

    if (existing) {
      existing.deviceName = deviceName;
      existing.lastSeen = lastSeen;
      existing.authority = authority;
      existing.iconKey = iconKey || null;
      if (allowClientAccess !== undefined) existing.allowClientAccess = allowClientAccess;
      return existing.save();
    }

    const agent = await Agent.create({
      fingerprint,
      deviceName,
      lastSeen,
      authority,
      iconKey: iconKey || null,
      allowClientAccess: allowClientAccess || null,
    });
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
    authority,
    allowClientAccess,
  }: {
    deviceName?: string;
    authority?: string | null;
    allowClientAccess?: boolean;
  }) {
    deviceName && (this.deviceName = deviceName);
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
  declare AgentId: number | null;
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

  isLocalType() {
    return this.type === StorageType.Local;
  }

  async delete() {
    if (this.type === StorageType.Local) {
      const localStorageCount = await Storage.count({ where: { type: StorageType.Local } });
      if (localStorageCount === 1) {
        throw new Error("Cannot delete local storage.");
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
    authType,
    username,
    url,
    oneAuthId,
    storageType,
    Agent,
  }: {
    authType: StorageAuthType;
    username: string | null;
    url: string | null;
    oneAuthId: string | null;
    storageType: StorageType;
    Agent?: Agent;
  }) {
    const where: any = {};
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

  static async createStorage(data: CreateStorageType) {
    await Storage.validateData(data);

    const existing = await Storage.getExisting({
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
    if (data.Agent) {
      await storage.setAgent(data.Agent);
    }
    return storage;
  }

  static async getById(id: number) {
    return Storage.findByPk(id);
  }

  static async getLocalStorage() {
    return Storage.findOne({ where: { type: StorageType.Local } });
  }

  static async getStorages(storageIds: number[], onlyIds = false) {
    const storages = await Storage.findAll({
      where: { id: storageIds },
      include: {
        attributes: onlyIds ? ["id"] : undefined
      }
    });
    return storages;
  }

  static async getAllStorages() {
    return Storage.findAll();
  }
}

export class PendingAuth extends DbModel {
  declare id: number;
  declare referenceId: string;
  declare partialCode1: string;
  declare storageType: StorageType;
  declare expiresOn: Date;

  static _indexes: ModelIndexesOptions[] = [
    { unique: true, fields: ['referenceId'] }
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
    const secret = this.makeSecret(partialCode2);
    const storage = await Storage.createStorage( {
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
    storageType,
    referenceId,
    partialCode1,
  }: {
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
    Storage,
    PendingAuth,
    PinnedFolders,
    Agent,
    PhotoLibraryLocation,
  ];
  for (const cls of classes) {
    cls.register(db);
  }

  Agent.hasOne(Storage, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Storage.belongsTo(Agent);

  Storage.hasMany(PinnedFolders, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  PinnedFolders.belongsTo(Storage);
}
