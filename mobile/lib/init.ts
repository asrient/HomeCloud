import { setModules, ModulesType } from "shared/modules";
import CryptoImpl from "./cryptoImpl";
import MobileServiceController from "./serviceController";
import { MobileConfigType, MobilePlatform, UITheme } from "./types";
import MobileConfigStorage from "./configStorage";
import * as Device from 'expo-device';
import { applicationName, nativeApplicationVersion } from 'expo-application';
import { File, Paths, Directory } from 'expo-file-system/next';
import { Platform } from 'react-native';

const cryptoModule = new CryptoImpl();
// eslint-disable-next-line @typescript-eslint/no-require-imports
global.Buffer = require('buffer').Buffer;

async function createOrGetSecretKey(dataDir: string) {
    const secretKeyPath = Paths.join(dataDir, "secret.key");
    const file = new File(secretKeyPath);
    if (!file.exists) {
        console.log("Secret key not found. Creating a new one..");
        const secretKey = cryptoModule.generateRandomKey();
        file.write(secretKey);
        console.log("✅ Secret key written to file:", secretKeyPath);
        return secretKey;
    }
    return file.text();
}

async function getOrGenerateKeys(dataDir: string) {
    const privateKeyPath = Paths.join(dataDir, "private.pem.key");
    const publicKeyPath = Paths.join(dataDir, "public.pem.key");
    const privateKeyFile = new File(privateKeyPath);
    const publicKeyFile = new File(publicKeyPath);
    if (!privateKeyFile.exists || !publicKeyFile.exists) {
        console.log("🔑 Key pair not found. Generating a new one..");
        const { privateKey, publicKey } = await cryptoModule.generateKeyPair();
        privateKeyFile.write(privateKey);
        publicKeyFile.write(publicKey);
        console.log("✅ Key pair written to files:", privateKeyPath, publicKeyPath);
        return { privateKeyPem: privateKey, publicKeyPem: publicKey };
    }
    const privateKeyText = await privateKeyFile.text();
    const publicKeyText = await publicKeyFile.text();
    return {
        privateKeyPem: privateKeyText,
        publicKeyPem: publicKeyText,
    };
}

async function getConfig() {
    // Set the modules for the app
    let dataDir = Paths.join(Paths.document.uri);
    if (Platform.OS === 'ios') {
        dataDir = Paths.join(Paths.document.uri, '.MediaCenter');
        const dir = new Directory(dataDir);
        if (!dir.exists) {
            dir.create();
        }
    }
    const { privateKeyPem, publicKeyPem } = await getOrGenerateKeys(dataDir);
    const fingerprint = cryptoModule.getFingerprintFromPem(publicKeyPem);
    const isDev = Platform.isTesting || __DEV__;
    const mobilePlatform: MobilePlatform = Platform.OS === 'ios' ? MobilePlatform.IOS : MobilePlatform.ANDROID;
    const mobileConfig: MobileConfigType = {
        IS_DEV: isDev,
        PLATFORM: mobilePlatform,
        DATA_DIR: dataDir,
        SECRET_KEY: await createOrGetSecretKey(dataDir),
        VERSION: nativeApplicationVersion || 'unknown',
        DEVICE_NAME: Device.deviceName || Device.modelName || 'My Mobile',
        PUBLIC_KEY_PEM: publicKeyPem,
        PRIVATE_KEY_PEM: privateKeyPem,
        FINGERPRINT: fingerprint,
        APP_NAME: applicationName || 'Media Center',
        UI_THEME: mobilePlatform === MobilePlatform.IOS ? UITheme.Ios : UITheme.Android,
        SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:4000",
        WS_SERVER_URL: process.env.EXPO_PUBLIC_WS_SERVER_URL || "ws://localhost:4000/ws",
    };
    return mobileConfig;
}

export async function initModules() {
    if ((global as any).modules) {
        console.log("Modules already initialized. skipping...");
        return;
    }
    const config = await getConfig();
    const modules: ModulesType = {
        crypto: cryptoModule,
        config,
        ServiceController: MobileServiceController,
        ConfigStorage: MobileConfigStorage,
        getLocalServiceController: () => MobileServiceController.getLocalInstance<MobileServiceController>(),
        getRemoteServiceController: async (fingerprint: string) => {
            return MobileServiceController.getRemoteInstance(fingerprint);
        },
    };
    setModules(modules, global);
    const serviceController = MobileServiceController.getLocalInstance<MobileServiceController>();
    await serviceController.setup();
    console.log("✅ Modules initialized.");
}
