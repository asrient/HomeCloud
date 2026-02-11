import { AccountService, AccountOpts } from "shared/accountService";
import { AppState, AppStateStatus } from "react-native";

export default class MobileAccountService extends AccountService {
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    private appStateActive = true;

    public async init(opts: AccountOpts) {
        await super.init(opts);
        this.setupAppStateListener();
    }

    private setupAppStateListener(): void {
        this.appStateSubscription = AppState.addEventListener("change", this.handleAppStateChange);
    }

    public override async connectWebSocket() {
        if (!this.appStateActive) {
            console.log("App is in background; skipping WebSocket connection.");
            return;
        }
        return super.connectWebSocket();
    };

    private handleAppStateChange = (state: AppStateStatus): void => {
        if (state === "background") {
            this.appStateActive = false;
            this.stopWebSocket();
        } else if (state === "active") {
            this.appStateActive = true;
            this.connectWebSocket();
        }
    };
}
