/// <reference path="./global.d.ts" />
import { BASE_URL, configSetup, PORT } from "./config";
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

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.disable('x-powered-by');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logRequests);
app.use(express.static('exposed'));
app.use(setupRequestContext);

// Attach routes
app.get('/', function (_req, res) {
  res.send('MediaCenter Online.');
});

app.use('/api', apiRouter);

// Handle 404
app.use(function (_req, res) {
  res.status(404);
  res.send('Not Found.');
});

// Should be the last middleware.
app.use(handleErrors);

(async () => {
  await mcdb.setupDb();
  await globalComms.setup();
  await emailService.setup();
  await udpService.setup();

  // Setup WebSocket server
  wss.on('connection', startPeerDispatch);

  // Start HTTP server (with both Express app and WebSocket server)
  server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`API available at ${BASE_URL}`);
    console.log(`WebSocket server ready`);
  });
})();
