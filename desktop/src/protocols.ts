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
    const serviceController = await getServiceController(fingerprint);
    // Desktop uses web views which don't support HEIC, so always convert
    const { name, mime, stream } = await serviceController.files.getPreview(filePath, { supportsHeic: false });
    if (!stream) {
      throw new Error(`File not found: ${filePath}`);
    }
    const response: GlobalResponse = new Response(stream, {
      headers: {
        'Content-Type': mime || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': '604800', // 7 days
      },
    });
    return response;
  }
  throw new Error(`Unsupported media request: ${request.url}`);
}

export function handleProtocols() {
  // Register a custom protocol to serve files from assets/web
  protocol.handle('app', async (request) => {
    if (request.url.startsWith('app://media')) {
      // Handle media requests
      return handleMediaRequest(request);
    }
    let url = request.url.replace('app://-', '');
    // Ensure the URL is safe and does not contain any path traversal characters
    if (url.includes('..') || url.includes('~')) {
      throw new Error('Invalid URL');
    }
    // add .html if URL does not point to a file
    const ext = path.extname(url);
    if (ext === '') {
      url += '.html';
    }
    // Construct the file path
    const filePath = path.join(__dirname, '../assets/web', url);
    // Check if the file exists
    try {
      fs.promises.access(filePath);
    }
    catch (error) {
      console.error('File not found:', filePath);
      throw new Error(`File not found: ${filePath}`);
    }
    return net.fetch(`file://${filePath}`)
  });
}
