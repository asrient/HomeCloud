import {
    setupEnvConfig,
    OptionalType,
    ProfilesPolicy,
    DiscoveryService,
} from "../src/core/index";

function setupConfig() {
    const isDev = true;
    const dataDir = '';
    const webServerBaseUrl = `http://127.0.0.1:5000/`;
    const clientBaseUrl = 'http://localhost:3000/';

    const profilesPolicy: ProfilesPolicy = {
        passwordPolicy: OptionalType.Optional,
        allowSignups: false,
        listProfiles: true,
        syncPolicy: OptionalType.Optional,
        adminIsDefault: true,
        requireUsername: false,
        singleProfile: true,
    };
    const libraryDir = '';
    setupEnvConfig({
        isDev,
        desktopIsPackaged: false,
        dataDir,
        baseUrl: clientBaseUrl,
        apiBaseUrl: webServerBaseUrl + "api/",
        webBuildDir: '', // fix this
        profilesPolicy,
        secretKey: 'xxx',
        oneAuthServerUrl: '',
        oneAuthAppId: '',
        allowPrivateUrls: true,
        deviceName: 'Test Device',
        libraryDir,
        publicKeyPem: '',
        privateKeyPem: '',
        fingerprint: 'xx-xx-xx-xx',
        certPem: '',
        advertiseService: true,
        //agentPort: 7000,
    });
}

setupConfig();
const discovery = DiscoveryService.setup();
discovery.hello();
discovery.listen();

setInterval(() => {
    console.log('Discovery candidates:', DiscoveryService.getInstace().getCandidates());
}, 5000);
