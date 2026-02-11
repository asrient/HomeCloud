const CONFIG_VERSION = 1;

export default class ConfigStorage {
    protected data: any;
    private isLoaded: boolean = false;
    // Prevent serializing when deserializing.
    private locked = false
    protected storeName: string;

    private static INSTANCES: Map<string, ConfigStorage> = new Map();

    public static getInstance(storeName: string): ConfigStorage {
        if (!this.INSTANCES.has(storeName)) {
            this.INSTANCES.set(storeName, new this(storeName));
        }
        return this.INSTANCES.get(storeName)!;
    }

    protected constructor(storeName: string) {
        this.storeName = storeName;
        this.data = {};
    }

    public getStoreName() {
        return this.storeName;
    }

    private assertLoaded() {
        if (!this.isLoaded) {
            throw new Error(`Config not loaded yet. Call load() before using the storage.`);
        }
    }

    public getItem<T>(key: string): T | undefined {
        this.assertLoaded();
        // lookup in the data object
        const data = this.data[key];
        if (data === undefined) {
            return undefined; // Return undefined if the key does not exist
        }
        // Return a deep copy of the data to prevent mutation
        return JSON.parse(JSON.stringify(data)) as T;
    }

    public setItem(key: string, value: any) {
        this.assertLoaded();
        // Create a deep copy of the value to prevent mutation
        const valueCopy = JSON.parse(JSON.stringify(value));
        // set the value in the data object
        this.data[key] = valueCopy;
    }

    public deleteKey(key: string) {
        this.assertLoaded();
        // delete the key from the data object
        delete this.data[key];
    }

    public getAllKeys() {
        this.assertLoaded();
        // return all keys in the data object
        return Object.keys(this.data);
    }

    public clear() {
        this.assertLoaded();
        // clear the data object
        this.data = {};
    }

    public async save() {
        if (this.locked)
            return
        this.locked = true;
        const config = { ...this.data };
        config.version = CONFIG_VERSION;
        await this.saveToDisk(config);
        this.locked = false;
    }

    public async load() {
        if (this.locked)
            return;
        this.locked = true;
        const config = (await this.loadFromDisk()) || {};
        this.locked = false;
        this.isLoaded = true;
        if (config.version !== CONFIG_VERSION) {
            console.warn(`Config version mismatch: expected ${CONFIG_VERSION}, got ${config.version}`);
            return this.data;
        }
        this.data = config;
        delete this.data.version;
    }

    protected async loadFromDisk(): Promise<any> {
        // Load the config from disk
        // This should be implemented in the subclass
        throw new Error('loadFromDisk() not implemented');
    }
    protected async saveToDisk(data: any) {
        // Save the config to disk
        // This should be implemented in the subclass
        throw new Error('saveToDisk() not implemented');
    }
}
