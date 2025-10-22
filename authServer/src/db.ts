import { Db, MongoClient, ObjectId } from 'mongodb';
import { MONGO_DB_URL, DB_NAME } from './config';
import { Account, Peer, PeerInfo, AccountCreate, PeerCreate } from "./types";
import { toObjectId } from './utils';

enum Collections {
    Account = 'account',
    Peer = 'peer',
}

export class MCDB {
    private static instance: MCDB;
    private dbClient: MongoClient | null = null;
    private db: Db | null = null;

    private constructor() { }

    public static getInstance(): MCDB {
        if (!MCDB.instance) {
            MCDB.instance = new MCDB();
        }
        return MCDB.instance;
    }

    private getDb(): Db {
        if (!this.dbClient) {
            throw new Error('Database client is not initialized.');
        }
        if (!this.db) {
            this.db = this.dbClient.db(DB_NAME);
        }
        return this.db;
    }

    public async setupDb(): Promise<void> {
        this.dbClient = new MongoClient(MONGO_DB_URL);
        await this.dbClient.connect();
        console.log('Connected to MongoDB');
        await this.initializeIndexes();
    }

    // Initialize unique indexes
    private async initializeIndexes(): Promise<void> {
        const db = this.getDb();

        // Ensure unique index on Account collection (email as _id already ensures uniqueness)
        await db.collection(Collections.Account).createIndex({ email: 1 }, { unique: true });

        // Ensure unique index on Peer collection (fingerprint as _id already ensures uniqueness)
        await db.collection(Collections.Peer).createIndex({ fingerprint: 1 }, { unique: true });
    }

    public async getAccountById(id: ObjectId | string): Promise<Account | null> {
        const db = this.getDb();
        const objectId = toObjectId(id);

        return await db.collection<Account>(Collections.Account).findOne({ _id: objectId });
    }

    public async getOrCreateAccount(email: string): Promise<Account> {
        const db = this.getDb();

        // Try to find existing account
        let account = await db.collection<Account>(Collections.Account).findOne({ email });

        if (!account) {
            // Create new account if not found
            const now = Date.now();
            const newAccount: AccountCreate = {
                email,
                createdAt: now,
                updatedAt: now
            };

            const result = await db.collection<AccountCreate>(Collections.Account).insertOne(newAccount);
            account = { ...newAccount, _id: result.insertedId };
        }

        return account;
    }

    public async createPeer(accountId: ObjectId | string, peerInfo: PeerInfo): Promise<Peer> {
        const db = this.getDb();
        const objectId = toObjectId(accountId);

        const peer: PeerCreate = {
            ...peerInfo,
            accountId: objectId,
            createdAt: Date.now()
        };

        const result = await db.collection<PeerCreate>(Collections.Peer).insertOne(peer);
        return { ...peer, _id: result.insertedId };
    }

    public async removePeerByFingerprint(fingerprint: string): Promise<boolean> {
        const db = this.getDb();

        const result = await db.collection(Collections.Peer).deleteOne({ fingerprint });
        return result.deletedCount > 0;
    }

    public async removePeerById(id: string | ObjectId): Promise<boolean> {
        const db = this.getDb();
        const objectId = toObjectId(id);

        const result = await db.collection(Collections.Peer).deleteOne({ _id: objectId });
        return result.deletedCount > 0;
    }

    public async getPeersForAccount(accountId: ObjectId | string): Promise<Peer[]> {
        const db = this.getDb();
        const objectId = toObjectId(accountId);

        return await db.collection<Peer>(Collections.Peer)
            .find({ accountId: objectId })
            .toArray();
    }

    public async getPeerByFingerprint(fingerprint: string): Promise<Peer | null> {
        const db = this.getDb();

        return await db.collection<Peer>(Collections.Peer).findOne({ fingerprint });
    }

    public async getPeerById(id: ObjectId | string): Promise<Peer | null> {
        const db = this.getDb();
        const objectId = toObjectId(id);

        return await db.collection<Peer>(Collections.Peer).findOne({ _id: objectId });
    }

    public getPeerForAccount(accountId: ObjectId | string, fingerprint: string): Promise<Peer | null> {
        const db = this.getDb();
        const objectId = toObjectId(accountId);

        return db.collection<Peer>(Collections.Peer).findOne({ accountId: objectId, fingerprint });
    }

    public async updatePeerInfo(peerInfo: Partial<PeerInfo>, id?: string | ObjectId): Promise<Peer | null> {
        const db = this.getDb();
        let query = {};
        if (!!id) {
            query = { _id: toObjectId(id) };
        } else if (peerInfo.fingerprint) {
            query = { fingerprint: peerInfo.fingerprint };
        } else {
            throw new Error('Either id or fingerprint must be provided to update peer info');
        }
        // delete fingerprint from update data for safety
        if (peerInfo.fingerprint) {
            delete peerInfo.fingerprint;
        }
        const result = await db.collection<Peer>(Collections.Peer).findOneAndUpdate(
            query,
            { $set: peerInfo },
            { returnDocument: 'after' }
        );
        return result || null;
    }

    public async peerExists(id: ObjectId | string): Promise<boolean> {
        const db = this.getDb();
        const objectId = toObjectId(id);

        const count = await db.collection(Collections.Peer).countDocuments({ _id: objectId }, { limit: 1 });
        return count > 0;
    }

    public async getPeerFingerprint(id: ObjectId | string): Promise<string | null> {
        const db = this.getDb();
        const objectId = toObjectId(id);

        const peer = await db.collection<Peer>(Collections.Peer).findOne({ _id: objectId }, { projection: { fingerprint: 1 } });
        return peer ? peer.fingerprint : null;
    }
}

// Export convenience functions and singleton instance
const mcdb = MCDB.getInstance();
export default mcdb;
