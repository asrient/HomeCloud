/* eslint-disable @typescript-eslint/no-unused-vars */
import Zeroconf from 'react-native-zeroconf';
import { RSA } from 'react-native-rsa-native';
import { Platform, Linking } from 'react-native';
import { File, Paths, Directory } from 'expo-file-system/next';

export const openSettings = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 30) {
        // Direct user to system settings to grant "All files access"
        Linking.openSettings(); // This will open app settings, user needs to navigate to permissions
        // Alternatively, for direct "Manage all files" settings:
        // Linking.openURL('package:' + YOUR_PACKAGE_NAME); // Replace YOUR_PACKAGE_NAME
    }
};

class BonjourServiceTest {
    private zeroconf: Zeroconf;

    constructor() {
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('start', () => {
            console.log('Bonjour service started');
        });

        this.zeroconf.on('error', (error) => {
            console.error('Error in Bonjour service:', error);
        });

        this.zeroconf.on('found', (service) => {
            console.log('Service found:', service);
        });

        this.zeroconf.on('resolved', (service) => {
            console.log('Service resolved:', service);
        });
    }

    getServices() {
        return this.zeroconf.getServices();
    }

    start() {
        this.zeroconf.publishService('http', 'tcp', 'local.', 'ContinuityCenter', 12345, {
            'hi': 'Hello from Continuity Center',
        });
    }

    stop() {
        this.zeroconf.stop();
        this.zeroconf.removeAllListeners();
        this.zeroconf.unpublishService('ContinuityCenter');
    }
}

const signatureBase64 = 'iqsSMNLQXZlxnf7YoOF+VXnMA7uGF3mdemM0Xc2B9wZYZxT5WZBfuI4C5AYeRwm4mFbbPsDHSsmOflDhPsmx0+dYdJ0KzUDblgfnQdU+247HCmolRpiajV7feYWZd9T03+6EJNmVB/c6FaKi1B4NaABr5fHlPErg46O04h38+p4668XHPq5zYkqeI3yGRy87sCamC7X6GvdIDGBNRtLAKK0Ofiw+WTH99VErX1KM4MLPYN7WlBRhrnraHGYm665fKVygKV1BUWFsxwt6tnZlo5jxEjugudjRBt+86Q+Bbicyi8ZwTVPOxEukXuayQCqrYdmz+4k681mWwILjiXJtLQ==';
const publicKey = '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAyWo2wV3n7XlwDK6OcpAoCrZu65DPxJtfHJR5k6fT6dfTBSZ/3Dyu\nKoEq5IQZ4+ifmWzIFmsfOhKEYxAcfOeFGUvuPpu6qosNxCLXEty4g4zjUnYYisYc\n9ru2i2Sw6lkvvhTHpUhQ7oCQ84mXIIR4STV/lqnZvGRAIOf0ynJdnAQPG622ehH5\nOsLaXtH+Q/SA480DuxeOxkPp1pMTDlXSNcpTf+2din6j4EjVaObThnxpPPxLi7oY\nh+KqGuY3+RLTY7PAWZKXyvJEnCDZ3rHmEm5JAEzjenGTeOQc6RKe5+lGZaEDP+rZ\nuTSETcDa3a2P9Us0zFLbG0KRit7RuAeHnQIDAQAB\n-----END RSA PUBLIC KEY-----\n';
const signedMsg = 'Hello!'

const testRSA = async () => {
    const keyPair = await RSA.generateKeys(2048);
    console.log('Generated RSA Key Pair:', keyPair);

    const message = 'Hello!';
    //const encryptedMessage = await RSA.encrypt(message, keyPair.public);
    //console.log('Encrypted Message:', encryptedMessage);

    // sign the message
    const signature = await RSA.sign(message, keyPair.private);
    console.log('Signature:', signature);
    console.log('Signed Public Key:', keyPair.public);
}

const verifySignature = async () => {
    const isValid = await RSA.verify(signatureBase64, signedMsg, publicKey);
    console.log('Signature valid:', isValid);
}

const encryptMessage = async () => {
    const message = 'Hello!';
    const encryptedMessage = await RSA.encrypt(message, publicKey);
    console.log('Encrypted Message:', encryptedMessage);
}

// 'file:///storage/emulated/0'

const readExternalStorage = async () => {
    const dir = new Directory('file:///storage/emulated/0/Download'); // Adjust path as needed
    console.log('Reading external storage directory:', dir);
    const files = dir.list();
    files.forEach(file => {
        console.log('File:', file.name, file.uri);
        if (file instanceof File) {
            const type = file.type;
            console.log('File Type:', type);
            if (type?.startsWith('image/') || type?.startsWith('video/')) {
                // Example: Generate thumbnail for image files
                generateThumbnail(file.uri).then(thumbnailUri => {
                    console.log('Generated Thumbnail URI:', thumbnailUri);
                }).catch(err => {
                    console.error('Error generating thumbnail:', err);
                });
            }
        }
    });
}

const generateThumbnail = async (filePath: string) => {
    const localSc = modules.getLocalServiceController();
    const url = await localSc.thumbnail.generateThumbnailURI(filePath);
    return url;
}

export const runTests = () => {
    //const server = createServer();
    //const client = createClient('localhost', 12345);
    //const bonjourService = new BonjourServiceTest();
    //bonjourService.start();
    //console.log('Bonjour service started and listening for services...');
    // setTimeout(() => {
    //     console.log(bonjourService.getServices());
    // }, 10000);
    //testRSA();
    //verifySignature();
    //encryptMessage();
    readExternalStorage();
}
