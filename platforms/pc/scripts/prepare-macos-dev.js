#!/usr/bin/env node
'use strict';

// Cmd+Tab 显示的是正在运行的 .app 里的可执行文件名。
// 开发态直接跑 Electron.app 时，这个名字固定是 Electron，改菜单栏标题不会影响它。
// 这里克隆一份 xShell.app，并把可执行文件改名为 xShell。

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = 'xShell';
const BUNDLE_ID = 'com.shellplusplus.app';
const CONTENT_RATIO = 824 / 1024;

if (process.platform !== 'darwin') {
  process.exit(0);
}

const root = path.join(__dirname, '..');
const electronApp = path.join(root, 'node_modules/electron/dist/Electron.app');
const sourceBinary = path.join(electronApp, 'Contents/MacOS/Electron');
const sourcePng = path.join(root, 'src/assets/icons/icon.png');
const devRoot = path.join(root, '.dev-app');
const devApp = path.join(devRoot, `${APP_NAME}.app`);
const devBinary = path.join(devApp, 'Contents/MacOS', APP_NAME);
const devPlist = path.join(devApp, 'Contents/Info.plist');
const devIcon = path.join(devApp, 'Contents/Resources/electron.icns');
const stampPath = path.join(devRoot, 'source-mtime');

if (!fs.existsSync(sourceBinary) || !fs.existsSync(sourcePng)) {
  console.error('找不到 Electron.app 或贝壳图标，请先在 platforms/pc 执行 npm install');
  process.exit(1);
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'ignore' });
}

function plistRaw(key) {
  return execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', devPlist], {
    encoding: 'utf8'
  }).trim();
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildDockIcns() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shellpp-icon-'));
  const iconset = path.join(work, 'icon.iconset');
  fs.mkdirSync(iconset);

  const canvas = 1024;
  const content = Math.round(canvas * CONTENT_RATIO);
  const resized = path.join(work, 'resized.png');
  const padded = path.join(work, 'padded.png');
  run('sips', ['-z', String(content), String(content), sourcePng, '--out', resized]);
  run('sips', ['-p', String(canvas), String(canvas), resized, '--out', padded]);

  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ];
  for (const [name, size] of sizes) {
    run('sips', ['-z', String(size), String(size), padded, '--out', path.join(iconset, name)]);
  }

  const icnsPath = path.join(work, 'icon.icns');
  run('iconutil', ['-c', 'icns', iconset, '-o', icnsPath]);
  return icnsPath;
}

function cloneElectronApp() {
  fs.rmSync(devRoot, { recursive: true, force: true });
  fs.mkdirSync(devRoot, { recursive: true });
  try {
    run('cp', ['-cR', electronApp, devApp]);
  } catch (error) {
    run('cp', ['-R', electronApp, devApp]);
  }
  fs.renameSync(path.join(devApp, 'Contents/MacOS/Electron'), devBinary);
  fs.writeFileSync(stampPath, String(fs.statSync(sourceBinary).mtimeMs));
}

const sourceMtime = String(fs.statSync(sourceBinary).mtimeMs);
const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8') : '';
if (!fs.existsSync(devBinary) || stamp !== sourceMtime) {
  cloneElectronApp();
}

const dockIcns = buildDockIcns();
const plistUpdates = [
  ['CFBundleName', APP_NAME],
  ['CFBundleDisplayName', APP_NAME],
  ['CFBundleExecutable', APP_NAME],
  ['CFBundleIdentifier', BUNDLE_ID]
];
let changed = false;
for (const [key, value] of plistUpdates) {
  if (plistRaw(key) !== value) {
    run('plutil', ['-replace', key, '-string', value, devPlist]);
    changed = true;
  }
}
if (!fs.existsSync(devIcon) || sha256(devIcon) !== sha256(dockIcns)) {
  fs.copyFileSync(dockIcns, devIcon);
  changed = true;
}

if (changed) {
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  if (fs.existsSync(lsregister)) {
    try {
      run(lsregister, ['-f', devApp]);
    } catch (error) {
      // 注册失败不影响下次启动时由系统重新读取应用包。
    }
  }
}
