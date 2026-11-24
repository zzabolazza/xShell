#!/usr/bin/env node
'use strict';

/**
 * xShell launcher for xLauncher / ~/.xTools/bin.
 * Listens on XSHELL_LISTEN_ADDR (or -addr), serves a minimal status page,
 * then starts the Electron desktop app in the same process group.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveListenAddr } = require('./listen-addr');

const STATUS_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xShell - AI box</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; }
    main { max-width: 28rem; padding: 2rem; text-align: center; }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0; line-height: 1.5; color: #94a3b8; }
  </style>
</head>
<body>
  <main>
    <h1>xShell</h1>
    <p>桌面应用已启动。可关闭此标签页，继续在 xShell 窗口中使用。</p>
  </main>
</body>
</html>
`;

function resolvePcRoot() {
  if (process.env.XSHELL_PC_ROOT) {
    return path.resolve(process.env.XSHELL_PC_ROOT);
  }
  const beside = path.join(__dirname, 'pc');
  if (fs.existsSync(path.join(beside, 'package.json'))) {
    return beside;
  }
  const fromRepo = path.join(__dirname, '..', 'platforms', 'pc');
  if (fs.existsSync(path.join(fromRepo, 'package.json'))) {
    return fromRepo;
  }
  throw new Error(`xShell PC app not found next to ${__dirname}`);
}

function electronCommand(pcRoot) {
  if (process.platform === 'darwin') {
    return path.join(pcRoot, '.dev-app', 'xShell.app', 'Contents', 'MacOS', 'xShell');
  }
  return path.join(pcRoot, 'node_modules', '.bin', 'electron');
}

function startHttpServer(host, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (req.method === 'GET' && (url === '/' || url.startsWith('/?'))) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(STATUS_HTML);
        return;
      }
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });
    server.on('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

function spawnElectron(pcRoot) {
  const command = electronCommand(pcRoot);
  if (!fs.existsSync(command)) {
    throw new Error(
      `Electron binary missing: ${command}. Run make install (or npm ci + prepare-macos-dev on macOS) in the PC app tree.`,
    );
  }
  return spawn(command, ['.'], {
    cwd: pcRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

async function main() {
  const { host, port } = resolveListenAddr(process.argv, process.env);
  const pcRoot = resolvePcRoot();
  const server = await startHttpServer(host, port);
  console.error(`xShell listening on http://${host}:${port}/ (PC root: ${pcRoot})`);

  let child;
  try {
    child = spawnElectron(pcRoot);
  } catch (err) {
    server.close();
    throw err;
  }

  const shutdown = (code, signal) => {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    if (signal) {
      try {
        process.kill(process.pid, signal);
      } catch {
        process.exit(1);
      }
      return;
    }
    process.exit(code == null ? 0 : code);
  };

  child.on('error', (err) => {
    console.error('xShell failed to start Electron:', err.message);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    shutdown(code, signal);
  });

  const forward = (signal) => {
    if (child && !child.killed) {
      try {
        child.kill(signal);
      } catch {
        /* ignore */
      }
    }
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  resolvePcRoot,
  electronCommand,
  STATUS_HTML,
};
