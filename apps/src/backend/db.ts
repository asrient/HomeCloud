import { Sequelize } from "sequelize"
import { envConfig } from "./envConfig";
import { initModels } from "./models";

export let db: Sequelize;

export async function initDb(dbType: string, path: string) {
    console.log('💽 Connecting to database:', path);

    switch (dbType) {
        case 'sqlite':
            db = new Sequelize({
                dialect: 'sqlite',
                storage: path,
                dialectModule: require('sqlite3').verbose(),
            });
            break;
        case 'mysql':
            db = new Sequelize(path, {
                dialect: 'mysql',
                dialectModule: require('mysql2'),
            });
            break;
        default:
            console.error(`Unsupported database type: ${dbType}`);
            return false;
    }

    try {
        await db.authenticate();
        console.log('💽 Database Connection established.');
    } catch (error) {
        console.error('❌ Unable to connect to the database:', error);
        return false;
    }

    initModels(db);
    if(envConfig.IS_DEV) {
        await db.sync({ alter: true });
    }
    return true;
}
