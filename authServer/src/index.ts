/// <reference path="./global.d.ts" />
import { BASE_URL, configSetup, PORT, SERVER_MODE } from "./config";
import express from "express";
import apiRouter from './api';
import { handleErrors, logRequests, setupRequestContext } from "./middlewares";
import mcdb from "./db";
import globalComms from "./globalComms";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { startPeerDispatch } from "./peerDispatch";
import emailService from "./emailService";
import udpService from "./udpService";

configSetup();

async function startAPIServer() {
  await emailService.setup();

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.disable('x-powered-by');

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(logRequests);
  app.use(express.static('exposed'));
  app.use(setupRequestContext);

  app.get('/', function (_req, res) {
    res.send('HomeCloud Online.');
  });

  app.use('/api', apiRouter);

  app.use(function (_req, res) {
    res.status(404);
    res.send('Not Found.');
  });

  app.use(handleErrors);

  wss.on('connection', startPeerDispatch);

  server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`API available at ${BASE_URL}`);
    console.log(`WebSocket server ready`);
  });
}

async function startUDPServer() {
  await udpService.setup();
}

(async () => {
  await mcdb.setupDb();
  await globalComms.setup();

  if (!SERVER_MODE || SERVER_MODE === 'api') {
    await startAPIServer();
  }

  if (!SERVER_MODE || SERVER_MODE === 'udp') {
    await startUDPServer();
  }
})();
