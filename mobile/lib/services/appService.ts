import { AppService } from 'shared/appService';
import { buildLogExportFile, deleteLogExportFile } from '../logger';
import * as Sharing from 'expo-sharing';

export default class MobileAppService extends AppService {
    public override async exportLogs(): Promise<void> {
        const exportPath = await buildLogExportFile();
        try {
            await Sharing.shareAsync(exportPath, {
                mimeType: 'text/plain',
                dialogTitle: 'Share App Logs',
            });
        } finally {
            deleteLogExportFile();
        }
    }
}
