import { Sequelize } from "sequelize";
import { envConfig } from "./envConfig";
import { initModels, Profile } from "./models";
import { verbose } from "sqlite3";

export let db: Sequelize;

export type DefaultProfile = {
  name: string;
  username: string | null;
  password: string | null;
}

export async function setupDbData(defaultProfile: DefaultProfile) {
  const count = await Profile.countProfiles();
  if (count === 0) {
    console.log("🔑 Creating default profile...");
    const profile = await Profile.createProfile({
      ...defaultProfile,
      isAdmin: true,
      accessControl: null,
    }, null);
    envConfig.setMainProfileId(profile.id);
  }
  else if (count === 1) {
    const profile = await Profile.getFirstProfile();
    envConfig.setMainProfileId(profile.id);
  }
}

export async function initDb(path: string) {
  console.log("💽 Connecting to database:", path);
    db = new Sequelize({
      dialect: "sqlite",
      storage: path,
      dialectModule: verbose(),
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
  return true;
}
