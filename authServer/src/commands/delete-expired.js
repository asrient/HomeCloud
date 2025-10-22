import 'dotenv/config';
//import { PendingAuths } from "../models.js";
//import { connect } from 'mongoose';

export async function runCommand() {
    //await connect(process.env.MONGO_DB_URL);
    console.log('Removing Expired objects from the database...');
    //const res = await PendingAuths.deleteExpired();
    console.log('Removed Expired Pending Auths:', res);
    process.exit(0);
}

runCommand();
