import { AppService } from 'shared/appService.js';

export default class ServerAppService extends AppService {
    protected override shouldAutoConnectPeer(): boolean {
        return true;
    }
}
