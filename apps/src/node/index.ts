import 'dotenv/config';
import http from 'http';
import https from 'https';
import ServerAdaptor from './serverAdaptor';
import fs from 'fs';
import { setupEnvConfig, EnvType, envConfig } from '../backend/envConfig';
import path from 'path';
import os from 'os';
import { initDb } from '../backend/db';

const startText = `\n
██╗░░██╗░█████╗░███╗░░░███╗███████╗░█████╗░██╗░░░░░░█████╗░██╗░░░██╗██████╗░
██║░░██║██╔══██╗████╗░████║██╔════╝██╔══██╗██║░░░░░██╔══██╗██║░░░██║██╔══██╗
███████║██║░░██║██╔████╔██║█████╗░░██║░░╚═╝██║░░░░░██║░░██║██║░░░██║██║░░██║
██╔══██║██║░░██║██║╚██╔╝██║██╔══╝░░██║░░██╗██║░░░░░██║░░██║██║░░░██║██║░░██║
██║░░██║╚█████╔╝██║░╚═╝░██║███████╗╚█████╔╝███████╗╚█████╔╝╚██████╔╝██████╔╝
╚═╝░░╚═╝░╚════╝░╚═╝░░░░░╚═╝╚══════╝░╚════╝░╚══════╝░╚════╝░░╚═════╝░╚═════╝░
\n
🎨 Art credit: https://fsymbols.com/generators/carty/
🐱 Starting HomeCloud Server...`;

class AppServer {
    port: number = 5000;
    sslPort: number = 5001;
    server: ServerAdaptor;

    constructor() {
        console.log(startText);
        this.setupConfig();
        this.server = new ServerAdaptor();
    }

    setupConfig() {
        const isDev = process.env.NODE_ENV === 'development';
        const dataDir = process.env.DATA_DIR || isDev ? path.resolve(__dirname, '../nodeData') : path.join(os.homedir(), '/.homecloud');
        this.port = parseInt(process.env.PORT || '5000');
        this.sslPort = parseInt(process.env.PORT || '5001');
        const baseUrl = process.env.BASE_URL || `http://localhost:${this.port}/`;

        setupEnvConfig({
            isDev,
            envType: EnvType.Server,
            dataDir,
            baseUrl,
            webBuildDir: path.join(__dirname, '../web'),
        });
    }

    startServer() {
        http.createServer(this.server.nativeHandler)
            .listen(this.port);

        console.log(`⚡️ HTTP Server started on port: ${this.port}`);

        if (process.env.SSL !== 'true' || !process.env.SSL_KEY_PATH || !process.env.SSL_CERT_PATH) {
            return;
        }
        https.createServer({
            key: fs.readFileSync(process.env.SSL_KEY_PATH || ''),
            cert: fs.readFileSync(process.env.SSL_CERT_PATH || '')
        }, this.server.nativeHandler)
            .listen(this.sslPort);

        console.log(`⚡️ HTTPS Server started on port: ${this.sslPort}`);
    }

    async start() {
        if (!process.env.DB_URL || !await initDb('mysql' , process.env.DB_URL)) {
            if (!process.env.DB_URL) {
                console.error('❗️ DB_URL env variable not set!');
            }
            console.error('❌ Failed to initialize database. Exiting...');
            process.exit(1);
        }
        this.startServer();
        console.log(`🌎 Go ahead, visit ${envConfig.BASE_URL}`);
    }
}

const appServer = new AppServer();
appServer.start();
