#!/usr/bin/env node
/**
 * Raw TCP throughput benchmark
 * 
 * Interactive: node tcp-bench.js
 * Direct:     node tcp-bench.js server
 *             node tcp-bench.js sendserver
 *             node tcp-bench.js client <host>
 *             node tcp-bench.js receive <host>
 *             node tcp-bench.js loopback
 */

const net = require('net');
const os = require('os');
const readline = require('readline');

const PORT = 9876;
const DURATION_MS = 10_000;
const CHUNK_SIZE = 65536; // 64KB

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push({ name, address: addr.address });
      }
    }
  }
  return ips;
}

function formatSpeed(bytesPerSec) {
  const mbps = (bytesPerSec * 8) / 1_000_000;
  const MBs = bytesPerSec / (1024 * 1024);
  return `${MBs.toFixed(1)} MB/s (${mbps.toFixed(1)} Mbps)`;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Server: receives data and measures speed ───
function runServer(mode = 'receive') {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.setNoDelay(true);
      const remote = `${socket.remoteAddress}:${socket.remotePort}`;

      if (mode === 'receive') {
        console.log(`\n[Receive] Client connected: ${remote}`);
        let totalBytes = 0;
        const start = Date.now();
        let lastLog = start;
        let lastBytes = 0;

        socket.on('data', (chunk) => {
          totalBytes += chunk.length;
          const now = Date.now();
          if (now - lastLog >= 2000) {
            const intervalBytes = totalBytes - lastBytes;
            const intervalSec = (now - lastLog) / 1000;
            console.log(`  ... ${formatSpeed(intervalBytes / intervalSec)} (${(totalBytes / (1024 * 1024)).toFixed(0)} MB received)`);
            lastLog = now;
            lastBytes = totalBytes;
          }
        });

        socket.on('end', () => {
          const elapsed = (Date.now() - start) / 1000;
          const speed = totalBytes / elapsed;
          console.log(`\n[Receive] Done: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB in ${elapsed.toFixed(2)}s`);
          console.log(`[Receive] Speed: ${formatSpeed(speed)}`);
          server.close();
          resolve({ totalBytes, elapsed, speed, direction: 'receive' });
        });

        socket.on('error', (err) => console.error('Socket error:', err.message));

      } else {
        console.log(`\n[Send] Client connected: ${remote}`);
        const buf = Buffer.alloc(CHUNK_SIZE, 0x42);
        let totalBytes = 0;
        const start = Date.now();
        let lastLog = start;
        let lastBytes = 0;

        function sendLoop() {
          while (true) {
            if (Date.now() - start >= DURATION_MS) {
              const elapsed = (Date.now() - start) / 1000;
              const speed = totalBytes / elapsed;
              console.log(`\n[Send] Done: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB in ${elapsed.toFixed(2)}s`);
              console.log(`[Send] Speed: ${formatSpeed(speed)}`);
              socket.end();
              server.close();
              resolve({ totalBytes, elapsed, speed, direction: 'send' });
              return;
            }

            const now = Date.now();
            if (now - lastLog >= 2000) {
              const intervalBytes = totalBytes - lastBytes;
              const intervalSec = (now - lastLog) / 1000;
              console.log(`  ... ${formatSpeed(intervalBytes / intervalSec)} (${(totalBytes / (1024 * 1024)).toFixed(0)} MB sent)`);
              lastLog = now;
              lastBytes = totalBytes;
            }

            const ok = socket.write(buf);
            totalBytes += buf.length;
            if (!ok) {
              socket.once('drain', sendLoop);
              return;
            }
          }
        }

        sendLoop();
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT} (mode: ${mode})`);
      console.log('Waiting for client to connect...');
    });
  });
}

// ─── Client: sends data to server ───
function runClientSend(host) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    const buf = Buffer.alloc(CHUNK_SIZE, 0x42);
    let totalBytes = 0;
    let startTime;

    socket.connect(PORT, host, () => {
      console.log(`Connected to ${host}:${PORT}`);
      console.log(`Sending for ${DURATION_MS / 1000}s...\n`);
      startTime = Date.now();

      function sendLoop() {
        while (true) {
          if (Date.now() - startTime >= DURATION_MS) {
            socket.end();
            return;
          }
          const ok = socket.write(buf);
          totalBytes += buf.length;
          if (!ok) {
            socket.once('drain', sendLoop);
            return;
          }
        }
      }
      sendLoop();
    });

    socket.on('close', () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = totalBytes / elapsed;
      resolve({ totalBytes, elapsed, speed, direction: 'send' });
    });

    socket.on('error', reject);
  });
}

// ─── Client: receives data from server ───
function runClientReceive(host) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setNoDelay(true);
    let totalBytes = 0;
    let startTime;
    let resolved = false;

    socket.connect(PORT, host, () => {
      console.log(`Connected to ${host}:${PORT}`);
      console.log(`Receiving for ${DURATION_MS / 1000}s...\n`);
      startTime = Date.now();
    });

    socket.on('data', (chunk) => {
      totalBytes += chunk.length;
    });

    function finish() {
      if (resolved) return;
      resolved = true;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = totalBytes / elapsed;
      resolve({ totalBytes, elapsed, speed, direction: 'receive' });
    }

    socket.on('end', finish);
    socket.on('close', finish);
    socket.on('error', reject);
  });
}

// ─── Interactive mode ───
async function interactive() {
  const ips = getLocalIPs();

  console.log('\n═══════════════════════════════════════');
  console.log('       TCP Throughput Benchmark');
  console.log('═══════════════════════════════════════');
  console.log(`\nThis device's IP addresses:`);
  ips.forEach(({ name, address }) => console.log(`  ${name}: ${address}`));
  console.log(`\nChunk: ${CHUNK_SIZE / 1024}KB | Duration: ${DURATION_MS / 1000}s | Port: ${PORT}`);
  console.log('');

  console.log('What do you want to do?');
  console.log('  1) Loopback test (both directions, this machine only)');
  console.log('  2) Send TO a remote server (run "server" on the other machine first)');
  console.log('  3) Receive FROM a remote server (run "sendserver" on the other machine first)');
  console.log('  4) Be the server — wait for remote to SEND here');
  console.log('  5) Be the server — SEND to a connecting remote client');
  console.log('');

  const choice = await prompt('Choose [1-5]: ');

  switch (choice) {
    case '1': {
      console.log('\n── Loopback Test (2 sequential tests) ──');

      // Test 1: Send
      console.log('\n[Test 1/2] Send throughput...');
      const s1 = net.createServer((sock) => {
        sock.on('data', () => {});
        sock.on('end', () => s1.close());
      });
      s1.listen(PORT, '127.0.0.1');
      await new Promise(r => setTimeout(r, 100));
      const sendResult = await runClientSend('127.0.0.1');
      console.log(`  → ${formatSpeed(sendResult.speed)}`);

      await new Promise(r => setTimeout(r, 500));

      // Test 2: Receive
      console.log('\n[Test 2/2] Receive throughput...');
      const recvDone = runServer('send');
      await new Promise(r => setTimeout(r, 100));
      const recvResult = await runClientReceive('127.0.0.1');
      await recvDone;
      console.log(`  → ${formatSpeed(recvResult.speed)}`);

      console.log('\n═══════════════════════════════════════');
      console.log('  Send:    ' + formatSpeed(sendResult.speed));
      console.log('  Receive: ' + formatSpeed(recvResult.speed));
      console.log('═══════════════════════════════════════\n');
      break;
    }

    case '2': {
      const host = await prompt('Remote server IP: ');
      console.log(`\nSending to ${host} for ${DURATION_MS / 1000}s...`);
      const result = await runClientSend(host);
      console.log(`\n→ Send speed: ${formatSpeed(result.speed)}`);
      break;
    }

    case '3': {
      const host = await prompt('Remote server IP (running "sendserver"): ');
      console.log(`\nReceiving from ${host}...`);
      const result = await runClientReceive(host);
      console.log(`\n→ Receive speed: ${formatSpeed(result.speed)}`);
      break;
    }

    case '4': {
      const ip = ips[0]?.address || '<this-ip>';
      console.log(`\nWaiting for remote to send data here.`);
      console.log(`On the other machine run:  node tcp-bench.js client ${ip}\n`);
      await runServer('receive');
      break;
    }

    case '5': {
      const ip = ips[0]?.address || '<this-ip>';
      console.log(`\nWill send data to the first connecting client.`);
      console.log(`On the other machine run:  node tcp-bench.js receive ${ip}\n`);
      await runServer('send');
      break;
    }

    default:
      console.log('Invalid choice.');
  }

  process.exit(0);
}

// ─── CLI direct mode ───
async function main() {
  const mode = process.argv[2];

  if (!mode) {
    return interactive();
  }

  const ips = getLocalIPs();
  console.log(`This device: ${ips.map(i => `${i.name}:${i.address}`).join(', ')}`);

  if (mode === 'server') {
    await runServer('receive');
  } else if (mode === 'sendserver') {
    await runServer('send');
  } else if (mode === 'client') {
    const host = process.argv[3] || '127.0.0.1';
    const result = await runClientSend(host);
    console.log(`\n→ Send speed: ${formatSpeed(result.speed)}`);
  } else if (mode === 'receive') {
    const host = process.argv[3] || '127.0.0.1';
    const result = await runClientReceive(host);
    console.log(`\n→ Receive speed: ${formatSpeed(result.speed)}`);
  } else if (mode === 'loopback') {
    // Send test
    const s = net.createServer((sock) => {
      sock.on('data', () => {});
      sock.on('end', () => s.close());
    });
    s.listen(PORT, '127.0.0.1');
    await new Promise(r => setTimeout(r, 100));
    const sendResult = await runClientSend('127.0.0.1');

    await new Promise(r => setTimeout(r, 300));

    // Receive test
    const recvDone = runServer('send');
    await new Promise(r => setTimeout(r, 100));
    const recvResult = await runClientReceive('127.0.0.1');
    await recvDone;

    console.log('\n══════════════════════════════');
    console.log(`  Send:    ${formatSpeed(sendResult.speed)}`);
    console.log(`  Receive: ${formatSpeed(recvResult.speed)}`);
    console.log('══════════════════════════════\n');
  } else {
    console.log('Usage: node tcp-bench.js                    (interactive)');
    console.log('       node tcp-bench.js server             (wait for client to send)');
    console.log('       node tcp-bench.js sendserver         (send to connecting client)');
    console.log('       node tcp-bench.js client <host>      (send to server)');
    console.log('       node tcp-bench.js receive <host>     (receive from sendserver)');
    console.log('       node tcp-bench.js loopback           (both directions locally)');
  }

  process.exit(0);
}

main().catch(console.error);
