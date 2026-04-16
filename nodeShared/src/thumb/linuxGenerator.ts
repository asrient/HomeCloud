import ThumbGenerator from "./generator";
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
    private thumbnailDir: string;

    constructor() {
        super();
        this.tools = ['ffmpegthumbnailer', 'convert', 'gnome-thumbnail-factory'];
        this.availableTool = null;
        this.thumbnailDir = path.join(os.homedir(), '.cache', 'thumbnails', 'normal');
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
        console.log('[Thumbnail] Setting up Linux generator...');

        // Ensure the thumbnail cache directory exists. On headless Linux
        // ~/.cache/thumbnails is not created by any desktop environment.
        await fs.promises.mkdir(this.thumbnailDir, { recursive: true });

        for (let tool of this.tools) {
            if (await this.isCommandAvailable(tool)) {
                this.availableTool = tool;
                console.debug(`[Thumbnail] ${tool} is available.`);
                break;
            }
        }

        if (!this.availableTool) {
            console.warn(
                '[Thumbnail] No suitable thumbnail generation tool found. ' +
                'Thumbnails will be disabled. ' +
                'Install one of: ffmpegthumbnailer, imagemagick (convert), or gnome-thumbnail-factory ' +
                'to enable thumbnail generation.'
            );
        }
    }

    // Per the freedesktop thumbnail spec, thumbnails for files on removable/mounted
     // volumes should be stored on the volume itself at `<mount>/.sh_thumbnails/normal/`
     // so they travel with the volume. Returns the mount root if `filePath` lives under
     // one of the common mount prefixes, otherwise null.
    // Spec: https://specifications.freedesktop.org/thumbnail-spec/0.8.0/thumbsave.html
    private getMountRoot(filePath: string): string | null {
        // For each prefix, the "mount" is the first N path segments under it.
        // /run/media uses <user>/<volume>, the others use a single <name>.
        const prefixes: { prefix: string; segments: number }[] = [
            { prefix: '/mnt', segments: 1 },
            { prefix: '/media', segments: 1 },
            { prefix: '/run/media', segments: 2 },
        ];
        for (const { prefix, segments } of prefixes) {
            if (!filePath.startsWith(prefix + '/')) continue;
            const parts = filePath.slice(prefix.length + 1).split('/');
            if (parts.length <= segments) continue;
            if (parts.slice(0, segments).some(p => !p)) continue;
            return path.join(prefix, ...parts.slice(0, segments));
        }
        return null;
    }

    private async resolveThumbnailDir(filePath: string): Promise<string> {
        const mountRoot = this.getMountRoot(filePath);
        if (!mountRoot) return this.thumbnailDir;

        const sharedDir = path.join(mountRoot, '.sh_thumbnails', 'normal');
        try {
            await fs.promises.mkdir(sharedDir, { recursive: true });
            return sharedDir;
        } catch {
            // Mount is read-only or not writable — fall back to user cache.
            return this.thumbnailDir;
        }
    }

    // Generate the thumbnail
    async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
        const thumbnailDir = await this.resolveThumbnailDir(filePath);
        const hash = this.getHash(filePath);
        let thumbnailPath = path.join(thumbnailDir, `${hash}.png`);

        // Check if the thumbnail already exists
        try {
            const stats = await fs.promises.stat(thumbnailPath);
            if (stats.size > 0) {
                // Return the cached thumbnail if valid
                return fs.promises.readFile(thumbnailPath);
            }
        } catch {
            // Not cached — fall through to generation.
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
            await fs.promises.rename(tempThumbnailPath, thumbnailPath);

            return fs.promises.readFile(thumbnailPath);
        } catch (error: any) {
            // Best-effort cleanup of any partial temp file.
            await fs.promises.unlink(tempThumbnailPath).catch(() => { });
            throw new Error(`Cannot generate thumbnail for "${path.basename(filePath)}": ${error.message.split('\n')[0]}`);
        }
    }

    // Stop method
    async stop() {
        console.log('[Thumbnail] Stopping Linux generator...');
        // Clean up any resources or states if necessary
    }
}
