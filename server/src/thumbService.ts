import { ThumbService } from "shared/thumbService.js";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives.js";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export default class ServerThumbService extends ThumbService {
    private tools = ['ffmpegthumbnailer', 'convert'];
    private availableTool: string | null = null;

    private getHash(filePath: string): string {
        const uri = `file://${filePath}`;
        return crypto.createHash('md5').update(uri).digest('hex');
    }

    private async isCommandAvailable(cmd: string): Promise<boolean> {
        try {
            await execAsync(`${cmd} --version`);
            return true;
        } catch {
            return false;
        }
    }

    init() {
        super.init();
    }

    @serviceStartMethod
    async start() {
        for (const tool of this.tools) {
            if (await this.isCommandAvailable(tool)) {
                this.availableTool = tool;
                console.log(`[Thumbnail] Using ${tool} for thumbnail generation.`);
                break;
            }
        }
        if (!this.availableTool) {
            console.warn('[Thumbnail] No thumbnail generation tool found. Thumbnails will not be available.');
        }
    }

    @serviceStopMethod
    async stop() { }

    async generateThumbnailJPEGImpl(filePath: string): Promise<Buffer> {
        if (!this.availableTool) {
            throw new Error('No suitable thumbnail generation tool is available.');
        }

        const thumbnailDir = path.join(os.homedir(), '.cache', 'thumbnails', 'normal');
        const hash = this.getHash(filePath);
        const thumbnailPath = path.join(thumbnailDir, `${hash}.png`);

        // Check if the thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
            const stats = fs.statSync(thumbnailPath);
            if (stats.size > 0) {
                return fs.promises.readFile(thumbnailPath);
            }
        }

        await fs.promises.mkdir(thumbnailDir, { recursive: true });
        const tempThumbnailPath = path.join(thumbnailDir, `${hash}_${process.pid}_temp.png`);

        try {
            if (this.availableTool === 'ffmpegthumbnailer') {
                await execAsync(`ffmpegthumbnailer -i "${filePath}" -o "${tempThumbnailPath}" -s 128`);
            } else if (this.availableTool === 'convert') {
                await execAsync(`convert "${filePath}" -resize 128x128 "${tempThumbnailPath}"`);
            }

            fs.renameSync(tempThumbnailPath, thumbnailPath);
            return fs.promises.readFile(thumbnailPath);
        } catch (error: any) {
            throw new Error('Failed to generate thumbnail: ' + error.message);
        }
    }

    async generateThumbnailURIImpl(filePath: string): Promise<string> {
        const buffer = await this.generateThumbnailJPEGImpl(filePath);
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/jpeg;base64,${base64}`;
    }
}
