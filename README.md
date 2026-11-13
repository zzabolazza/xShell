# xShell

一个跨平台的Shell增强工具，支持Android和PC平台。

## 项目结构

```
ShellPlusPlus/
├── platforms/
│   ├── android/          # Android平台代码
│   │   ├── app/          # Android应用代码
│   │   ├── build.gradle  # Android构建配置
│   │   └── ...
│   └── pc/              # PC平台代码
│       ├── src/          # PC端源代码
│       ├── package.json  # Node.js依赖配置
│       └── ...
├── README.md             # 项目说明文档
└── ...
```

## 平台说明

### Android平台
- 基于Kotlin和Jetpack Compose开发
- 提供应用切换和手势识别功能
- 支持无障碍服务

### PC平台
- 基于Electron开发
- 提供跨平台桌面应用体验
- 支持应用管理和快捷操作

## 开发说明

### Android开发环境配置

#### 1. 环境要求
- Android Studio
- Android SDK (推荐路径: `D:\Android\SDK`)
- Java Development Kit (JDK)

#### 2. 配置环境变量
```bash
# 设置Android SDK路径
setx ANDROID_HOME "D:\Android\SDK"

# 设置AVD存储路径到D盘（解决C盘空间不足问题）
setx ANDROID_AVD_HOME "D:\Android\AVD"

# 添加到PATH（可选）
setx PATH "%PATH%;%ANDROID_HOME%\emulator;%ANDROID_HOME%\platform-tools"
```

#### 3. 创建Android虚拟设备(AVD)
```bash
# 创建D盘AVD目录
mkdir D:\Android\AVD

# 创建新的AVD（推荐使用小容量设备）
D:\Android\SDK\cmdline-tools\latest\bin\avdmanager.bat create avd -n SmallPhone -k "system-images;android-36;google_apis;x86_64" -d "pixel_2"
```

#### 4. 启动Android虚拟机
```bash
# 列出所有可用的AVD
D:\Android\SDK\emulator\emulator.exe -list-avds

# 启动特定的AVD
D:\Android\SDK\emulator\emulator.exe -avd SmallPhone

# 启动时指定分区大小（解决磁盘空间不足问题）
D:\Android\SDK\emulator\emulator.exe -avd SmallPhone -partition-size 2048

# 清理AVD数据（如果遇到问题）
D:\Android\SDK\emulator\emulator.exe -avd SmallPhone -wipe-data
```

#### 5. 编译和安装APK
```bash
# 进入Android项目目录
cd platforms/android

# 编译Debug版本APK
.\gradlew assembleDebug

# 安装APK到设备（需要设备已连接）
.\gradlew installDebug

# 一键编译并安装
.\gradlew clean assembleDebug installDebug

# 或
.\gradlew clean build

# 使用adb直接安装（推荐）
D:\Android\SDK\platform-tools\adb.exe install app\build\outputs\apk\debug\xShell-debug.apk
```

#### 6. 检查设备连接
```bash
# 检查已连接的设备
D:\Android\SDK\platform-tools\adb.exe devices

# 如果显示"List of devices attached"且为空，说明没有设备连接
# 需要先启动AVD或连接物理设备
```

#### 7. 常见问题解决

**问题1: 磁盘空间不足**
```bash
# 错误信息: Not enough space to create userdata partition
# 解决方案: 使用D盘存储AVD
setx ANDROID_AVD_HOME "D:\Android\AVD"
mkdir D:\Android\AVD
```

**问题2: AVD启动失败**
```bash
# 清理AVD数据
D:\Android\SDK\emulator\emulator.exe -avd SmallPhone -wipe-data

# 或删除重建AVD
D:\Android\SDK\cmdline-tools\latest\bin\avdmanager.bat delete avd -n SmallPhone
```

**问题3: 编译错误**
```bash
# 清理项目
.\gradlew clean

# 重新编译
.\gradlew assembleDebug
```

### PC开发
```bash
cd platforms/pc
npm install
npm start
```

## ICON生成
```shell
npm run electron:generate-icons
# 以及
magick convert platforms/pc/src/assets/icons/icon.png -resize 144x144 platforms/pc/src/assets/icons/144x144.png
```

## 许可证

本项目采用MIT许可证。