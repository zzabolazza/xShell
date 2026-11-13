// 主入口文件
const { app, ipcMain, session, nativeImage } = require('electron');
const path = require('path');
const electronLog = require('electron-log');

// 只影响 Electron 内部名称（关于、Quit 文案）。菜单栏上苹果图标旁的名字来自
// Electron.app 的 Info.plist，由 scripts/prepare-macos-dev.js 在启动前写入。
app.setPath('userData', path.join(app.getPath('appData'), 'Shell++'));
app.setName('xShell');

// 导入自定义模块
const AppManager = require('./appManager');
const WindowManager = require('./windowManager');
const AppSwitcher = require('./appSwitcher');
const ShortcutManager = require('./shortcutManager');
const MenuManager = require('./menuManager');
const ConfigManager = require('./configManager');
const { highlightForIconUrl } = require('./logoColor');

// 配置日志
electronLog.transports.file.level = 'info';
electronLog.info('应用启动');

// 单例应用
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// 创建模块实例
let appManager;
let windowManager;
let appSwitcher;
let shortcutManager;
let menuManager;
let configManager;
let isInitialized = false;
let isStarting = false;

// 设置IPC处理程序
function setupIpcHandlers() {
  // 移除现有的处理程序以避免重复注册
  ipcMain.removeAllListeners('minimize-window');
  ipcMain.removeAllListeners('toggle-maximize-window');
  ipcMain.removeAllListeners('close-window');
  ipcMain.removeHandler('get-apps');
  ipcMain.removeHandler('get-open-apps');
  ipcMain.removeHandler('switch-to-app');
  ipcMain.removeHandler('close-app');
  ipcMain.removeHandler('show-app-selector');
  ipcMain.removeHandler('show-launcher');
  ipcMain.removeHandler('minimize-active-app');
  ipcMain.removeHandler('close-active-app');
  ipcMain.removeHandler('collapse-view-chrome');
  ipcMain.removeHandler('open-shell-overlay');
  ipcMain.removeHandler('close-shell-overlay');
  ipcMain.removeHandler('add-app');
  ipcMain.removeHandler('remove-app');
  ipcMain.removeHandler('update-app');
  ipcMain.removeHandler('get-current-app-name');
  ipcMain.removeHandler('get-app-highlight');

  // 窗口控制
  ipcMain.on('minimize-window', () => {
    const mainWindow = windowManager.mainWindow;
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('toggle-maximize-window', () => {
    const mainWindow = windowManager.mainWindow;
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    const mainWindow = windowManager.mainWindow;
    if (mainWindow) mainWindow.close();
  });

  // 应用管理 - 确保这些处理程序只在这里注册一次
  ipcMain.handle('get-apps', () => {
    return appManager.getApps();
  });

  ipcMain.handle('get-app-highlight', (_, iconUrl) => highlightForIconUrl(iconUrl));

  ipcMain.handle('get-open-apps', () => {
    return windowManager.getOpenApps();
  });

  ipcMain.handle('switch-to-app', (_, appName) => {
    const app = appManager.getApps().find(a => a.name === appName);
    if (app) {
      windowManager.switchToApp(app);
      return true;
    }
    return false;
  });

  ipcMain.handle('close-app', (_, appName) => {
    windowManager.closeApp(appName);
    return true;
  });

  ipcMain.handle('show-app-selector', () => {
    appSwitcher.showAppSelector();
    return true;
  });

  ipcMain.handle('show-launcher', () => {
    windowManager.showLauncher();
    return true;
  });

  ipcMain.handle('minimize-active-app', () => {
    return windowManager.minimizeActiveView();
  });

  ipcMain.handle('close-active-app', () => {
    return windowManager.closeActiveView();
  });

  ipcMain.handle('collapse-view-chrome', () => {
    windowManager.collapseChromeFromUser();
    return true;
  });

  ipcMain.handle('open-shell-overlay', (_, mode) => {
    windowManager.beginShellOverlay(mode);
    return true;
  });

  ipcMain.handle('close-shell-overlay', () => {
    windowManager.endShellOverlay();
    return true;
  });

  // 应用管理 - 添加和删除应用
  ipcMain.handle('add-app', (_, app) => {
    try {
      appManager.addApp(app);
      // 通知所有窗口应用列表已更改
      windowManager.mainWindow?.webContents.send('apps-changed');
      return { success: true };
    } catch (error) {
      electronLog.error('添加应用失败:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('remove-app', (_, appName) => {
    try {
      // 先关闭应用（如果已打开）
      windowManager.closeApp(appName);
      // 然后从列表中删除
      appManager.removeApp(appName);
      // 通知所有窗口应用列表已更改
      windowManager.mainWindow?.webContents.send('apps-changed');
      return { success: true };
    } catch (error) {
      electronLog.error('删除应用失败:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sync-app-list', async () => {
    const updated = await appManager.syncFromSource();
    if (updated) {
      windowManager.mainWindow?.webContents.send('apps-changed');
    }
    return { success: updated, sourceUrl: appManager.getSourceUrl() };
  });

  ipcMain.handle('update-app', (_, appName, newApp) => {
    try {
      appManager.updateApp(appName, newApp);
      // 通知所有窗口应用列表已更改
      windowManager.mainWindow?.webContents.send('apps-changed');
      return { success: true };
    } catch (error) {
      electronLog.error('更新应用失败:', error);
      return { success: false, error: error.message };
    }
  });

  // 视图API
  ipcMain.handle('get-current-app-name', (event) => {
    // 查找发送请求的视图对应的应用名称
    for (const [name, view] of windowManager.views.entries()) {
      if (view.webContents.id === event.sender.id) {
        return name;
      }
    }
    return null;
  });
}

// 初始化应用
async function initializeApp() {
  if (isInitialized || isStarting) {
    electronLog.info('应用已经初始化，跳过重复初始化');
    return;
  }

  isStarting = true;
  electronLog.info('开始初始化应用');
  
  // 首先初始化配置管理器
  configManager = new ConfigManager();
  
  appManager = new AppManager();
  windowManager = new WindowManager();
  appSwitcher = new AppSwitcher(appManager, windowManager);
  shortcutManager = new ShortcutManager(appSwitcher, windowManager);

  // 设置IPC处理程序
  setupIpcHandlers();
  allowClipboardPermissions();

  // 先同步应用列表，主窗口第一次渲染就能读到最新结果
  await appManager.syncFromSource();

  // 创建主窗口后再注册快捷键，确保窗口事件能挂上
  windowManager.createMainWindow();

  // 注册快捷键
  shortcutManager.registerShortcuts();

  // 创建应用程序菜单
  menuManager = new MenuManager(windowManager);

  // 初始化配置
  configManager.initialize();

  // 配置管理器已集成到主窗口，无需独立窗口

  isInitialized = true;
  electronLog.info('应用初始化完成');
}

const DOCK_ICON_PATH = path.join(__dirname, '../assets/icons/icon.png');
// 与 prepare-macos-dev.js 相同：1024 画布中的 824 图标网格。
const DOCK_CONTENT_RATIO = 824 / 1024;

function paddedDockIcon(source) {
  const { width, height } = source.getSize();
  const contentWidth = Math.max(1, Math.round(width * DOCK_CONTENT_RATIO));
  const contentHeight = Math.max(1, Math.round(height * DOCK_CONTENT_RATIO));
  const resized = source.resize({ width: contentWidth, height: contentHeight, quality: 'best' });
  const bitmap = resized.toBitmap();
  const offsetX = Math.floor((width - contentWidth) / 2);
  const offsetY = Math.floor((height - contentHeight) / 2);
  const canvas = Buffer.alloc(width * height * 4);
  const rowBytes = contentWidth * 4;
  for (let y = 0; y < contentHeight; y += 1) {
    bitmap.copy(
      canvas,
      ((y + offsetY) * width + offsetX) * 4,
      y * rowBytes,
      (y + 1) * rowBytes
    );
  }
  return nativeImage.createFromBitmap(canvas, { width, height, scaleFactor: 1 });
}

// macOS 会缓存 Electron.app 里的 icns，所以启动后再设一次贝壳图。
// 留白后 Dock 不会把整张图铺满格子。
function setDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;

  const image = nativeImage.createFromPath(DOCK_ICON_PATH);
  if (image.isEmpty()) {
    electronLog.error('无法加载 Dock 图标:', DOCK_ICON_PATH);
    return;
  }
  app.dock.setIcon(paddedDockIcon(image));
}

// 应用准备就绪
app.whenReady().then(() => {
  electronLog.info('应用已准备就绪');
  setDockIcon();
  initializeApp();
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用激活时（macOS）
app.on('activate', () => {
  if (windowManager && !windowManager.mainWindow) {
    windowManager.createMainWindow();
  }
});

const CLIPBOARD_PERMISSIONS = [
  'clipboard-read',
  'clipboard-sanitized-write',
  'deprecated-sync-clipboard-read'
];

function allowClipboardPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(CLIPBOARD_PERMISSIONS.includes(permission));
  });
  // navigator.clipboard 还会走 check，而不只是 request。
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return CLIPBOARD_PERMISSIONS.includes(permission);
  });
}

// 菜单 role: 'quit'、Ctrl/Cmd+Q 和关闭最后一个窗口都会走到 app.quit()。
function quitApplication() {
  if (!windowManager) return;
  try {
    windowManager.closeAllApps();
  } catch (error) {
    electronLog.error('退出前关闭应用失败:', error);
  }
}

app.on('before-quit', () => {
  quitApplication();
});

// 应用退出前
app.on('will-quit', () => {
  // 注销所有快捷键
  if (shortcutManager) {
    shortcutManager.unregisterAllShortcuts();
  }
});

// 处理第二个实例启动
app.on('second-instance', () => {
  // 如果用户尝试运行第二个实例，我们应该聚焦到现有实例
  if (windowManager && windowManager.mainWindow) {
    if (windowManager.mainWindow.isMinimized()) {
      windowManager.mainWindow.restore();
    }
    windowManager.mainWindow.focus();
  }
});


