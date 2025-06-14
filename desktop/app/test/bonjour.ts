import {
    setupEnvConfig,
    OptionalType,
    DiscoveryService,
} from "../src/core/index";

function setupConfig() {
    const isDev = true;
    const dataDir = '';
    const webServerBaseUrl = `http://127.0.0.1:5000/`;
    const clientBaseUrl = 'http://localhost:3000/';

    setupEnvConfig({
        isDev,
        desktopIsPackaged: false,
        dataDir,
        baseUrl: clientBaseUrl,
        apiBaseUrl: webServerBaseUrl + "api/",
        secretKey: 'xxx',
        oneAuthServerUrl: '',
        oneAuthAppId: '',
        deviceName: 'Test Device',
        publicKeyPem: '',
        privateKeyPem: '',
        fingerprint: 'xx-xx-xx-xx',
        certPem: '',
        advertiseService: true,
        //agentPort: 7000,
        userHomeDir: '',
        appName: 'Test App',
        userName: 'Test User',
    });
}

setupConfig();
const discovery = DiscoveryService.setup();
discovery.hello();
discovery.listen();

setInterval(() => {
    console.log('Discovery candidates:', DiscoveryService.getInstace().getCandidates());
}, 5000);
