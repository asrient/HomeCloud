import { Sequelize } from "sequelize";
import { envConfig, StorageAuthType, StorageType } from "./envConfig";
import { initModels } from "./models";
import { verbose } from "sqlite3";
import { Storage } from "./models";

export let db: Sequelize;

async function fixDBContent() {
  let localStorage = await Storage.getLocalStorage();
  if (!localStorage) {
    console.log("🔧 Fix database: Local storage not found, creating one..");
    localStorage = await Storage.createStorage({
      type: StorageType.Local,
      name: "This Device",
      authType: StorageAuthType.None,
      oneAuthId: null,
      username: null,
      secret: null,
      url: null,
      Agent: null,
    })
  }
}

export async function initDb(path: string) {
  console.log("💽 Connecting to database:", path);
  db = new Sequelize({
    dialect: "sqlite",
    storage: path,
    dialectModule: verbose(),
    logging: envConfig.IS_DEV,
  });
  try {
    await db.authenticate();
    console.log("💽 Database Connection established.");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
    return false;
  }

  initModels(db);
  if (envConfig.IS_DEV) {
    //await db.sync({ alter: true });
  }
  await db.sync();
  await fixDBContent();
  return true;
}
