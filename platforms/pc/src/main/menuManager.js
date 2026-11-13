const { Menu, app, ipcMain } = require('electron');
const electronLog = require('electron-log');

class MenuManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.isHelpVisible = false;
    this.createMenu();

    // 注册 IPC 处理程序
    ipcMain.handle('toggle-shortcut-help', (_, show) => {
      if (show) {
        this.windowManager.beginShellOverlay('help');
      } else {
        this.windowManager.endShellOverlay();
      }
      this.isHelpVisible = this.windowManager.shellOverlay === 'help';
    });
  }

  syncHelpVisibility() {
    this.isHelpVisible = this.windowManager.shellOverlay === 'help';
  }

  // 显示快捷键帮助。再次调用会关闭。
  showShortcutHelp() {
    this.windowManager.beginShellOverlay('help');
    this.syncHelpVisibility();
  }

  // 打开设置面板。再次调用会关闭。
  openSettings(tab = null) {
    this.windowManager.beginShellOverlay('settings');
    this.syncHelpVisibility();
  }

  createMenu() {
    const template = [];

    if (process.platform === 'darwin') {
      template.push({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { label: 'Quit xShell', role: 'quit' }
        ]
      });
    } else {
      template.push({
        label: 'File',
        submenu: [
          {
            label: 'Quit xShell',
            accelerator: 'Ctrl+Q',
            role: 'quit'
          }
        ]
      });
    }

    template.push(
      { role: 'editMenu' },
      {
        label: '设置',
        submenu: [
          {
            label: '偏好设置...',
            accelerator: process.platform === 'darwin' ? 'Cmd+,' : 'Ctrl+,',
            click: () => {
              this.openSettings();
            }
          }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '键盘快捷键',
            accelerator: process.platform === 'darwin' ? 'Cmd+/' : 'Ctrl+/',
            click: () => {
              this.showShortcutHelp();
            }
          }
        ]
      }
    );

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    electronLog.info('应用程序菜单已创建');
  }
}

module.exports = MenuManager;
