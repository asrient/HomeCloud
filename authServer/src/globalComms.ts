import { REDIS_URL, isRedisEnabled } from "./config";
import { createClient, RedisClientType } from "redis";
import { EventEmitter } from "events";


export class GlobalComms {
    private static instance: GlobalComms;

    private isSetup: boolean = false;
    private redisClient?: RedisClientType;
    private redisSubscriber?: RedisClientType;
    private localStore: Map<string, { value: string; expiry?: number }>;
    private eventEmitter: EventEmitter;

    private constructor() {
        this.localStore = new Map();
        this.eventEmitter = new EventEmitter();
    }

    public async setup() {
        if (this.isSetup) return;

        if (isRedisEnabled()) {
            try {
                // Create Redis client for regular operations
                this.redisClient = createClient({ url: REDIS_URL! });
                await this.redisClient.connect();

                // Create separate Redis client for subscription
                this.redisSubscriber = createClient({ url: REDIS_URL! });
                await this.redisSubscriber.connect();

                console.log('Redis connection established');
            } catch (error) {
                console.error('Failed to connect to Redis:', error);
                throw error;
            }
        } else {
            console.log('Using in-memory storage for GlobalComms');
        }

        this.isSetup = true;
    }

    public async getKV(key: string): Promise<string | null> {
        if (isRedisEnabled() && this.redisClient) {
            try {
                return await this.redisClient.get(key);
            } catch (error) {
                console.error('Redis get error:', error);
                return null;
            }
        } else {
            // Use local storage
            const item = this.localStore.get(key);
            if (!item) return null;

            // Check if expired
            if (item.expiry && Date.now() > item.expiry) {
                this.localStore.delete(key);
                return null;
            }

            return item.value;
        }
    }

    public async setKV(key: string, value: string, expireInSec?: number): Promise<void> {
        if (isRedisEnabled() && this.redisClient) {
            try {
                if (expireInSec) {
                    await this.redisClient.setEx(key, expireInSec, value);
                } else {
                    await this.redisClient.set(key, value);
                }
            } catch (error) {
                console.error('Redis set error:', error);
                throw error;
            }
        } else {
            // Use local storage
            const item: { value: string; expiry?: number } = { value };
            if (expireInSec) {
                item.expiry = Date.now() + (expireInSec * 1000);
            }
            this.localStore.set(key, item);
        }
    }

    public async deleteKV(key: string): Promise<void> {
        if (isRedisEnabled() && this.redisClient) {
            try {
                await this.redisClient.del(key);
            } catch (error) {
                console.error('Redis delete error:', error);
                throw error;
            }
        } else {
            // Use local storage
            this.localStore.delete(key);
        }
    }
    
    public static getInstance(): GlobalComms {
        if (!GlobalComms.instance) {
            GlobalComms.instance = new GlobalComms();
        }
        return GlobalComms.instance;
    }

    public async publishEvent(event: string, data: string): Promise<void> {
        if (isRedisEnabled() && this.redisClient) {
            try {
                await this.redisClient.publish(event, data);
            } catch (error) {
                console.error('Redis publish error:', error);
                throw error;
            }
        } else {
            // Use local EventEmitter
            this.eventEmitter.emit(event, data);
        }
    }

    public async subscribeEvent(event: string, handler: (data: string) => void): Promise<void> {
        if (isRedisEnabled() && this.redisSubscriber) {
            try {
                await this.redisSubscriber.subscribe(event, handler);
            } catch (error) {
                console.error('Redis subscribe error:', error);
                throw error;
            }
        } else {
            // Use local EventEmitter
            this.eventEmitter.on(event, handler);
        }
    }

    public async unsubscribeEvent(event: string, handler: (data: string) => void): Promise<void> {
        if (isRedisEnabled() && this.redisSubscriber) {
            try {
                await this.redisSubscriber.unsubscribe(event, handler);
            } catch (error) {
                console.error('Redis unsubscribe error:', error);
                throw error;
            }
        } else {
            // Use local EventEmitter
            this.eventEmitter.off(event, handler);
        }
    }

    public async cleanup(): Promise<void> {
        if (isRedisEnabled()) {
            if (this.redisClient) {
                await this.redisClient.quit();
            }
            if (this.redisSubscriber) {
                await this.redisSubscriber.quit();
            }
        } else {
            this.localStore.clear();
            this.eventEmitter.removeAllListeners();
        }
        this.isSetup = false;
    }
}

const globalComms = GlobalComms.getInstance();
export default globalComms;
