import ThumbGenerator from "../generator";
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Thumbnail management specs: https://specifications.freedesktop.org/thumbnail-spec/0.8.0/thumbsave.html
// Currently only considering the "normal" size thumbnails.
// Not considering mounted directories for now, since it needs special handling.

export default class ThumbGeneratorLinux extends ThumbGenerator {
    private tools: string[];
    private availableTool: string | null;

    constructor() {
        super();
        this.tools = ['ffmpegthumbnailer', 'convert', 'gnome-thumbnail-factory'];
        this.availableTool = null;
    }

    // Utility to calculate MD5 hash for the URI
    private getHash(filePath: string): string {
        const uri = `file://${filePath}`;
        return crypto.createHash('md5').update(uri).digest('hex');
    }

    // Check if command is available
    private async isCommandAvailable(cmd: string): Promise<boolean> {
        try {
            await execAsync(`${cmd} --version`);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Setup method: Check for available tools once during setup
    async setup() {
        console.log('Setting up the Linux Thumbnail Generator...');

        for (let tool of this.tools) {
            if (await this.isCommandAvailable(tool)) {
                this.availableTool = tool;
                console.log(`${tool} is available.`);
                break;
            }
        }

        if (!this.availableTool) {
            throw new Error('No suitable thumbnail generation tool found.');
        }
    }

    // Check if the file is in a mounted directory (e.g., /mnt, /media)
    private isMountedDirectory(filePath: string): boolean {
        const mountDirs = ['/mnt', '/media', '/run/media', '/dev'];  // Add more if necessary
        return mountDirs.some(mountDir => filePath.startsWith(mountDir));
    }

    // Generate the thumbnail
    async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
        const thumbnailDir = path.join(os.homedir(), '.cache', 'thumbnails', 'normal');
        const hash = this.getHash(filePath);
        let thumbnailPath = path.join(thumbnailDir, `${hash}.png`);

        // Check if the thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
            const stats = fs.statSync(thumbnailPath);
            if (stats.size > 0) {
                // Return the cached thumbnail if valid
                return fs.promises.readFile(thumbnailPath);
            }
        }

        // If no valid tool is available, throw an error
        if (!this.availableTool) {
            throw new Error('No suitable thumbnail generation tool is available.');
        }

        // Create a temporary file name
        const tempThumbnailPath = path.join(thumbnailDir, `${hash}_${process.pid}_temp.png`);

        // Generate the thumbnail using the available tool
        try {
            if (this.availableTool === 'ffmpegthumbnailer') {
                await execAsync(`ffmpegthumbnailer -i "${filePath}" -o "${tempThumbnailPath}" -s 128`);
            } else if (this.availableTool === 'convert') {
                await execAsync(`convert "${filePath}" -resize 128x128 "${tempThumbnailPath}"`);
            } else if (this.availableTool === 'gnome-thumbnail-factory') {
                await execAsync(`gnome-thumbnail-factory -s 128 "${filePath}"`);
            } else {
                throw new Error(`Unsupported tool: ${this.availableTool}`);
            }

            // Atomic rename of the temporary thumbnail to the final location
            fs.renameSync(tempThumbnailPath, thumbnailPath);

            return fs.promises.readFile(thumbnailPath);
        } catch (error) {
            throw new Error('Failed to generate thumbnail: ' + error.message);
        }
    }

    // Stop method
    async stop() {
        console.log('Stopping the Linux Thumbnail Generator...');
        // Clean up any resources or states if necessary
    }
}
