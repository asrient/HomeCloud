import { protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getServiceController } from 'shared/utils';

export async function handleMediaRequest(request: Request): Promise<GlobalResponse> {
  const urlObj = new URL(request.url);
  if (urlObj.pathname === '/previewFile') {
    // Handle preview file request
    let fingerprint = urlObj.searchParams.get('fingerprint') || null;
    if (fingerprint === 'null') {
      fingerprint = null; // Convert 'null' string to actual null
    }
    const filePath = urlObj.searchParams.get('path') || '';
    console.log('Handling media preview request:', { fingerprint, path: filePath });
    try {
      const serviceController = await getServiceController(fingerprint);
      // Desktop uses web views which don't support HEIC, so always convert
      const { name, mime, stream } = await serviceController.files.getPreview(filePath, { supportsHeic: false });
      if (!stream) {
        return new Response('File not found', { status: 404 }) as GlobalResponse;
      }
      return new Response(stream as any, {
        headers: {
          'Content-Type': mime || 'application/octet-stream',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Cache-Control': 'max-age=3600', // 1 hour
        },
      }) as GlobalResponse;
    } catch (e: any) {
      console.error('Media preview error:', e?.message);
      return new Response(e?.message || 'Service unavailable', { status: 410 }) as GlobalResponse;
    }
  }
  return new Response('Not found', { status: 404 }) as GlobalResponse;
}

export function handleProtocols() {
  // Register a custom protocol to serve files from assets/web
  protocol.handle('app', async (request) => {
    if (request.url.startsWith('app://media')) {
      // Handle media requests
      return handleMediaRequest(request);
    }
    const parsed = new URL(request.url);
    let url = parsed.pathname.replace(/^\/?\-?\/?/, '/'); // normalize leading "/-/"
    // Ensure the URL is safe and does not contain any path traversal characters
    if (url.includes('..') || url.includes('~')) {
      throw new Error('Invalid URL');
    }
    // add .html if URL does not point to a file
    const ext = path.extname(url);
    if (ext === '') {
      url += '.html';
    }
    // Construct the file path (query string and hash are already stripped by URL parsing)
    const filePath = path.join(__dirname, '../assets/web', url);
    // Check if the file exists
    try {
      await fs.promises.access(filePath);
    }
    catch (error) {
      console.error('File not found:', filePath);
      throw new Error(`File not found: ${filePath}`);
    }
    // Re-append the original query string so the web app can read it
    const qs = parsed.search || '';
    return net.fetch(`file://${filePath}${qs}`)
  });
}
