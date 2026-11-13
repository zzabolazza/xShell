// 窗口管理模块
const { BrowserWindow, BrowserView, screen } = require('electron');
const path = require('path');
const electronLog = require('electron-log');

const VIEW_CHROME_WIDTH = 148;
const VIEW_CHROME_HEIGHT = 52;
const CHROME_HOT_WIDTH = 320;
const CHROME_HOT_HEIGHT = 40;
const CHROME_COLLAPSE_DELAY = 400;
const CHROME_POLL_MS = 80;
const CHROME_THEME_MS = 700;
const LIGHT_CHROME_THEME = {
  mode: 'light',
  background: 'rgba(255, 255, 255, 0.96)',
  color: '#1c1c1e',
  border: 'rgba(0, 0, 0, 0.14)'
};
const DARK_CHROME_THEME = {
  mode: 'dark',
  background: 'rgba(28, 28, 30, 0.94)',
  color: '#f5f5f7',
  border: 'rgba(255, 255, 255, 0.2)'
};

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.views = new Map(); // 存储所有打开的视图
    this.activeView = null; // 当前活跃视图
    this.minimizedViews = new Set(); // 存储最小化的视图
    this.suspendedAppName = null; // 设置/帮助盖住时暂挂的应用
    this.shellOverlay = null; // null | 'settings' | 'help'
    this.viewChrome = null;
    this.loadedViews = new Set();
    this.pendingLoadName = null;
    this.loadingAppName = null;
    this.loadingError = null;
    this.chromeExpanded = false;
    this.chromeSuppressExpand = false;
    this.chromeTheme = LIGHT_CHROME_THEME;
    this.chromeHoverTimer = null;
    this.chromeCollapseTimer = null;
    this.chromeThemeTimer = null;
    this.chromeSampling = false;
  }

  // 创建主窗口
  createMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    // 创建主窗口
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      },
      title: 'xShell',
      frame: true, // 使用系统标准窗口框架
      icon: path.join(__dirname, '../assets/icons/icon.png'),
      backgroundColor: '#f5f5f5' // 设置主窗口背景色，与main.html的body背景色一致
    });

    // 增加最大监听器数量，避免内存泄漏警告
    this.mainWindow.setMaxListeners(20);

    // 加载主窗口界面
    const mainHtmlPath = path.join(__dirname, '../renderer/main.html');
    console.log('Loading main HTML from:', mainHtmlPath);
    this.mainWindow.loadFile(mainHtmlPath);

    // 打开开发者工具以便调试
    // this.mainWindow.webContents.openDevTools();

    const reposition = () => {
      this.resizeActiveView();
      this.positionViewChrome();
    };
    this.mainWindow.on('resize', reposition);
    this.mainWindow.on('move', () => {
      this.positionViewChrome();
    });
    this.mainWindow.on('minimize', () => {
      this.hideViewChrome();
    });
    this.mainWindow.on('restore', () => {
      this.syncViewChrome();
    });
    this.mainWindow.on('blur', () => {
      this.hideViewChrome();
    });
    this.mainWindow.on('focus', () => {
      this.syncViewChrome();
      this.focusActiveView();
    });

    // 窗口关闭时清理资源
    this.mainWindow.on('closed', () => {
      this.stopChromeHoverWatch();
      if (this.viewChrome && !this.viewChrome.isDestroyed()) {
        this.viewChrome.destroy();
      }
      this.viewChrome = null;
      this.mainWindow = null;
      this.views.clear();
      this.activeView = null;
    });

    electronLog.info('主窗口已创建');
    return this.mainWindow;
  }

  // 创建或切换到应用视图
  switchToApp(appInfo) {
    const { name, url } = appInfo;

    // 确保主窗口存在
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.createMainWindow();
    }

    this.shellOverlay = null;
    this.suspendedAppName = null;

    if (this.views.has(name)) {
      this.presentView(name);
      return;
    }

    const view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, 'viewPreload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    view.setBackgroundColor('#ffffff');
    view.webContents.once('dom-ready', () => {
      view.webContents.insertCSS(`
        html, body {
          background-color: #ffffff !important;
          margin: 0;
          padding: 0;
        }
      `);
    });

    let loadFailed = false;
    view.webContents.on('did-start-loading', () => {
      loadFailed = false;
    });
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      loadFailed = true;
      if (this.pendingLoadName !== name) return;
      this.loadingAppName = name;
      this.loadingError = errorDescription || '页面加载失败';
      this.emitShellState();
      electronLog.error(`加载失败 ${name}:`, errorDescription);
    });
    view.webContents.on('did-finish-load', () => {
      if (loadFailed) return;
      this.loadedViews.add(name);
      if (this.pendingLoadName !== name) return;
      this.clearLoading();
      this.activateView(name, view);
    });

    this.views.set(name, view);
    this.beginLoading(name);

    view.webContents.loadURL(url).catch(err => {
      electronLog.error(`加载URL失败 ${url}:`, err);
      if (this.pendingLoadName !== name) return;
      this.loadingAppName = name;
      this.loadingError = err.message || '页面加载失败';
      this.emitShellState();
    });

    electronLog.info(`开始加载视图: ${name}`);
  }

  presentView(name) {
    const view = this.views.get(name);
    if (!view) return;

    if (this.loadedViews.has(name)) {
      this.clearLoading();
      this.activateView(name, view);
      return;
    }

    this.beginLoading(name);
  }

  beginLoading(name) {
    this.pendingLoadName = name;
    this.loadingAppName = name;
    this.loadingError = null;
    this.hideActiveViewForLoading();
    this.emitShellState();
  }

  clearLoading() {
    this.pendingLoadName = null;
    this.loadingAppName = null;
    this.loadingError = null;
  }

  hideActiveViewForLoading() {
    if (this.activeView && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.removeBrowserView(this.activeView);
    }
    this.activeView = null;
  }

  // 激活视图
  activateView(name, view) {
    // 移除当前活跃视图
    if (this.activeView) {
      this.mainWindow.removeBrowserView(this.activeView);
    }

    // 如果要激活的视图是最小化状态，将其从最小化状态中移除
    if (this.minimizedViews.has(name)) {
      this.minimizedViews.delete(name);
      electronLog.info(`已将视图 ${name} 从最小化状态中恢复`);
    }

    // 设置新的活跃视图
    this.mainWindow.addBrowserView(view);
    this.activeView = view;
    this.resizeActiveView();

    this.shellOverlay = null;
    this.suspendedAppName = null;

    this.emitShellState();
    this.focusActiveView();
    electronLog.info(`已激活视图: ${name}`);
  }

  focusActiveView() {
    if (!this.activeView || this.activeView.webContents.isDestroyed()) return;
    this.activeView.webContents.focus();
  }

  getActiveAppName() {
    if (!this.activeView) return null;

    for (const [name, view] of this.views.entries()) {
      if (view === this.activeView) {
        return name;
      }
    }

    return null;
  }

  getShellState() {
    return {
      activeApp: this.getActiveAppName(),
      suspendedApp: this.suspendedAppName,
      overlay: this.shellOverlay,
      loadingApp: this.loadingAppName,
      loadingError: this.loadingError
    };
  }

  emitShellState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const state = this.getShellState();
    this.mainWindow.webContents.send('shell-state', state);
    this.mainWindow.webContents.send('active-app-changed', state.activeApp);
    this.syncViewChrome();
  }

  ensureViewChrome() {
    if (this.viewChrome && !this.viewChrome.isDestroyed()) {
      return this.viewChrome;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null;
    }

    this.viewChrome = new BrowserWindow({
      width: VIEW_CHROME_WIDTH,
      height: VIEW_CHROME_HEIGHT,
      parent: this.mainWindow,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      acceptFirstMouse: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    this.setChromeMousePassthrough(!this.chromeExpanded);
    this.viewChrome.loadFile(path.join(__dirname, '../renderer/viewChrome.html'));
    this.viewChrome.webContents.on('did-finish-load', () => {
      this.sendChromeState();
    });
    this.viewChrome.on('closed', () => {
      this.viewChrome = null;
    });
    return this.viewChrome;
  }

  chromeSize() {
    return { width: VIEW_CHROME_WIDTH, height: VIEW_CHROME_HEIGHT };
  }

  setChromeMousePassthrough(passthrough) {
    if (!this.viewChrome || this.viewChrome.isDestroyed()) return;
    if (passthrough) {
      this.viewChrome.setIgnoreMouseEvents(true, { forward: true });
    } else {
      this.viewChrome.setIgnoreMouseEvents(false);
    }
  }

  positionViewChrome() {
    if (!this.viewChrome || this.viewChrome.isDestroyed() || !this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    const bounds = this.mainWindow.getContentBounds();
    const { width, height } = this.chromeSize();
    this.viewChrome.setBounds({
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y),
      width,
      height
    });
  }

  syncViewChrome() {
    const canShow = this.activeView
      && this.mainWindow
      && !this.mainWindow.isDestroyed()
      && !this.mainWindow.isMinimized()
      && this.mainWindow.isFocused();
    if (canShow) {
      this.showViewChrome();
    } else {
      this.hideViewChrome();
    }
  }

  showViewChrome() {
    const chrome = this.ensureViewChrome();
    if (!chrome) return;
    this.positionViewChrome();
    if (!chrome.isVisible()) {
      chrome.showInactive();
    }
    this.startChromeHoverWatch();
    this.startChromeThemeWatch();
  }

  hideViewChrome() {
    this.stopChromeHoverWatch();
    if (this.chromeExpanded) {
      this.chromeExpanded = false;
      this.setChromeMousePassthrough(true);
      this.sendChromeState();
    }
    if (this.viewChrome && !this.viewChrome.isDestroyed() && this.viewChrome.isVisible()) {
      this.viewChrome.hide();
    }
  }

  startChromeHoverWatch() {
    if (this.chromeHoverTimer) return;
    this.chromeHoverTimer = setInterval(() => {
      this.updateChromeHover();
    }, CHROME_POLL_MS);
  }

  stopChromeHoverWatch() {
    if (this.chromeHoverTimer) {
      clearInterval(this.chromeHoverTimer);
      this.chromeHoverTimer = null;
    }
    if (this.chromeCollapseTimer) {
      clearTimeout(this.chromeCollapseTimer);
      this.chromeCollapseTimer = null;
    }
    this.stopChromeThemeWatch();
  }

  pointerInChromeHotZone() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;
    const point = screen.getCursorScreenPoint();
    const bounds = this.mainWindow.getContentBounds();
    const hotWidth = Math.min(CHROME_HOT_WIDTH, bounds.width);
    const hotX = bounds.x + (bounds.width - hotWidth) / 2;
    return point.x >= hotX
      && point.x <= hotX + hotWidth
      && point.y >= bounds.y
      && point.y <= bounds.y + CHROME_HOT_HEIGHT;
  }

  updateChromeHover() {
    if (!this.activeView || !this.mainWindow || this.mainWindow.isDestroyed() || !this.mainWindow.isFocused() || this.mainWindow.isMinimized()) {
      this.hideViewChrome();
      return;
    }

    if (this.pointerInChromeHotZone()) {
      if (this.chromeCollapseTimer) {
        clearTimeout(this.chromeCollapseTimer);
        this.chromeCollapseTimer = null;
      }
      if (!this.chromeSuppressExpand) {
        this.expandChrome();
      }
    } else {
      this.chromeSuppressExpand = false;
      if (this.chromeExpanded && !this.chromeCollapseTimer) {
        this.chromeCollapseTimer = setTimeout(() => {
          this.chromeCollapseTimer = null;
          this.collapseChrome();
        }, CHROME_COLLAPSE_DELAY);
      }
    }
  }

  collapseChromeFromUser() {
    this.chromeSuppressExpand = true;
    if (this.chromeCollapseTimer) {
      clearTimeout(this.chromeCollapseTimer);
      this.chromeCollapseTimer = null;
    }
    this.collapseChrome();
  }

  expandChrome() {
    if (this.chromeExpanded) return;
    this.chromeExpanded = true;
    this.setChromeMousePassthrough(false);
    this.sendChromeState();
  }

  collapseChrome() {
    if (!this.chromeExpanded) return;
    this.chromeExpanded = false;
    this.setChromeMousePassthrough(true);
    this.sendChromeState();
  }

  sendChromeState() {
    if (!this.viewChrome || this.viewChrome.isDestroyed()) return;
    this.viewChrome.webContents.send('chrome-expanded', {
      expanded: this.chromeExpanded,
      theme: this.chromeTheme || LIGHT_CHROME_THEME
    });
  }

  startChromeThemeWatch() {
    this.sampleChromeTheme();
    if (this.chromeThemeTimer) return;
    this.chromeThemeTimer = setInterval(() => {
      this.sampleChromeTheme();
    }, CHROME_THEME_MS);
  }

  stopChromeThemeWatch() {
    if (this.chromeThemeTimer) {
      clearInterval(this.chromeThemeTimer);
      this.chromeThemeTimer = null;
    }
  }

  async sampleChromeTheme() {
    if (this.chromeSampling) return;
    const view = this.activeView;
    if (!view || view.webContents.isDestroyed()) return;

    const bounds = view.getBounds();
    const width = Math.min(80, bounds.width);
    const height = Math.min(16, bounds.height);
    if (width < 8 || height < 4) return;

    this.chromeSampling = true;
    try {
      const image = await view.webContents.capturePage({
        x: Math.max(0, Math.round((bounds.width - width) / 2)),
        y: 0,
        width,
        height
      });
      if (view !== this.activeView) return;
      const theme = themeFromCapture(image) || LIGHT_CHROME_THEME;
      if (!this.chromeTheme || this.chromeTheme.mode !== theme.mode) {
        this.chromeTheme = theme;
        this.sendChromeState();
      }
    } catch (error) {
      if (!this.chromeTheme) {
        this.chromeTheme = LIGHT_CHROME_THEME;
        this.sendChromeState();
      }
    } finally {
      this.chromeSampling = false;
    }
  }

  // 摘掉当前视图，但不标记最小化。用于设置/帮助。
  detachActiveView() {
    const name = this.getActiveAppName();
    if (this.activeView && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.removeBrowserView(this.activeView);
    }
    this.activeView = null;
    if (name) {
      this.suspendedAppName = name;
    }
  }

  // 回到启动器：摘掉当前应用并最小化，不自动切换到下一个。
  showLauncher() {
    const name = this.getActiveAppName() || this.suspendedAppName;
    if (this.activeView && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.removeBrowserView(this.activeView);
    }
    this.activeView = null;
    if (name && this.views.has(name)) {
      this.minimizedViews.add(name);
    }
    this.suspendedAppName = null;
    this.shellOverlay = null;
    this.clearLoading();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
    }
    this.emitShellState();
    electronLog.info('已回到启动器');
  }

  beginShellOverlay(mode) {
    if (mode !== 'settings' && mode !== 'help') return;

    if (this.shellOverlay === mode) {
      this.endShellOverlay();
      return;
    }

    if (this.activeView) {
      this.detachActiveView();
    }
    this.shellOverlay = mode;
    this.emitShellState();
  }

  endShellOverlay() {
    const suspended = this.suspendedAppName;
    this.shellOverlay = null;

    if (suspended && this.views.has(suspended) && !this.minimizedViews.has(suspended)) {
      this.suspendedAppName = null;
      this.activateView(suspended, this.views.get(suspended));
      return;
    }

    this.suspendedAppName = null;
    this.emitShellState();
  }

  // 调整活跃视图大小
  resizeActiveView() {
    if (!this.mainWindow || !this.activeView) return;

    // 获取窗口内容尺寸
    const contentSize = this.mainWindow.getContentSize();

    this.activeView.setBounds({
        x: 0,
        y: 0,
        width: contentSize[0],
        height: contentSize[1]
    });
  }

  // 获取所有打开的应用名称
  getOpenApps() {
    // 返回所有应用，包括最小化的
    return Array.from(this.views.keys());
  }

  // 获取应用的状态信息
  getAppStatus(appName) {
    return {
      isMinimized: this.minimizedViews.has(appName),
      isActive: this.views.get(appName) === this.activeView
    };
  }

  // 切换到下一个应用
  switchToNextApp() {
    const apps = this.getOpenApps();
    if (apps.length <= 1) return;

    let currentIndex = -1;
    if (this.activeView) {
      // 找到当前活跃应用的索引
      for (let i = 0; i < apps.length; i++) {
        if (this.views.get(apps[i]) === this.activeView) {
          currentIndex = i;
          break;
        }
      }
    }

    // 计算下一个应用的索引
    const nextIndex = (currentIndex + 1) % apps.length;
    const nextApp = apps[nextIndex];

    this.presentView(nextApp);
  }

  // 关闭应用
  closeApp(name) {
    if (!this.views.has(name)) return;

    const view = this.views.get(name);

    // 如果是当前活跃视图，先移除
    if (this.activeView === view) {
      this.mainWindow.removeBrowserView(view);
      this.activeView = null;

      // 如果还有其他视图，切换到第一个
      const apps = this.getOpenApps();
      if (apps.length > 1) {
        const nextApp = apps[0] === name ? apps[1] : apps[0];
        this.presentView(nextApp);
      }
    }

    if (this.suspendedAppName === name) {
      this.suspendedAppName = null;
    }
    if (this.pendingLoadName === name) {
      this.clearLoading();
    }
    this.loadedViews.delete(name);
    this.minimizedViews.delete(name);

    // 销毁视图并从集合中移除
    view.webContents.destroy();
    this.views.delete(name);

    if (!this.activeView) {
      this.emitShellState();
    }

    electronLog.info(`已关闭应用: ${name}`);
  }

  // 关闭当前活跃的视图
  closeActiveView() {
    if (!this.activeView) return;

    // 找到当前活跃视图的名称
    let activeName = null;
    for (const [name, view] of this.views.entries()) {
      if (view === this.activeView) {
        activeName = name;
        break;
      }
    }

    if (activeName) {
      this.closeApp(activeName);
      electronLog.info('已关闭当前活跃视图');
      return true;
    }

    return false;
  }

  // 关闭所有应用
  closeAllApps() {
    for (const [name, view] of this.views.entries()) {
      if (this.activeView === view) {
        this.mainWindow.removeBrowserView(view);
      }
      view.webContents.destroy();
    }

    this.views.clear();
    this.activeView = null;
    this.minimizedViews.clear();
    this.loadedViews.clear();
    this.suspendedAppName = null;
    this.shellOverlay = null;
    this.clearLoading();
    this.emitShellState();

    electronLog.info('已关闭所有应用');
  }

  // 最小化当前活跃视图
  minimizeActiveView() {
    if (!this.activeView) {
      return false;
    }

    // 获取当前活跃视图的名称
    let currentAppName = null;
    let currentIndex = -1;
    const allApps = Array.from(this.views.keys());
    
    for (let i = 0; i < allApps.length; i++) {
      if (this.views.get(allApps[i]) === this.activeView) {
        currentAppName = allApps[i];
        currentIndex = i;
        break;
      }
    }

    // 从主窗口移除视图并标记为最小化
    this.mainWindow.removeBrowserView(this.activeView);
    this.minimizedViews.add(currentAppName);
    this.activeView = null;

    // 从当前位置开始，寻找下一个未最小化的视图
    for (let i = 1; i < allApps.length; i++) {
      const nextIndex = (currentIndex + i) % allApps.length;
      const nextAppName = allApps[nextIndex];
      
      if (!this.minimizedViews.has(nextAppName)) {
        const nextView = this.views.get(nextAppName);
        this.activateView(nextAppName, nextView);
        electronLog.info(`已最小化 ${currentAppName} 并切换到下一个未最小化的视图 ${nextAppName}`);
        return true;
      }
    }

    // 如果所有视图都已最小化，显示主窗口
    if (this.mainWindow) {
      this.mainWindow.focus();
      electronLog.info(`已最小化 ${currentAppName}，所有视图已最小化，显示主窗口`);
    }

    this.emitShellState();
    return true;
  }

  // 按名称恢复最小化的视图
  restoreMinimizedView(name) {
    const minimizedViewName = name && this.minimizedViews.has(name)
      ? name
      : Array.from(this.minimizedViews)[0];

    if (!minimizedViewName) {
      return false;
    }

    const view = this.views.get(minimizedViewName);

    if (view) {
      // 从最小化集合中移除
      this.minimizedViews.delete(minimizedViewName);
      // 激活视图
      this.activateView(minimizedViewName, view);
      electronLog.info(`已恢复最小化视图: ${minimizedViewName}`);
      return true;
    }

    return false;
  }

  // 刷新当前活跃视图
  refreshActiveView() {
    if (this.activeView) {
      this.activeView.webContents.reload();
      electronLog.info('已刷新当前视图');
      return true;
    }
    return false;
  }
}

function themeFromCapture(image) {
  if (!image || image.isEmpty()) return LIGHT_CHROME_THEME;
  const bitmap = image.getBitmap();
  if (!bitmap || bitmap.length < 4) return LIGHT_CHROME_THEME;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < bitmap.length; i += 4) {
    const alpha = bitmap[i + 3];
    if (alpha < 16) continue;
    b += bitmap[i];
    g += bitmap[i + 1];
    r += bitmap[i + 2];
    count += 1;
  }
  if (count === 0) return LIGHT_CHROME_THEME;

  const luminance = relativeLuminance(r / count, g / count, b / count);
  return luminance > 0.45 ? DARK_CHROME_THEME : LIGHT_CHROME_THEME;
}

function relativeLuminance(red, green, blue) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

module.exports = WindowManager;
