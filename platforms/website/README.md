# xShell Website

这是 xShell 项目的官方网站，提供了一个专业的 AI 应用启动器主页。

## 功能特性

- 🚀 简洁美观的 AI 应用网格布局
- 📱 响应式设计，支持移动端和桌面端
- ➕ 动态添加新应用
- 🗑️ 删除不需要的应用
- 💾 本地存储应用列表
- 🎨 自动获取网站图标
- 🤖 内置 30+ 主流 AI 应用
- 🌐 支持中英文应用名称

## 内置 AI 应用

网站预置了丰富的 AI 应用，包括：

**国际 AI 平台：**
- ChatGPT, Claude, Gemini, Grok
- Perplexity, Mistral, Meta AI
- Microsoft Copilot, GitHub Copilot

**国内 AI 平台：**
- 文心一言、通义千问、讯飞星火
- 天工、豆包、Kimi、跃问
- 元宝、海螺AI、秘塔AI

**开发工具：**
- Hugging Face, OpenRouter, Replit
- YouWare, Monica, Z.ai

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS + 自定义 CSS
- **部署**: Vercel

## 快速开始

### 本地开发

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm run dev
```

3. 在浏览器中打开 [http://localhost:3000](http://localhost:3000)

### 构建和部署

1. 构建项目：
```bash
npm run build
```

2. 启动生产服务器：
```bash
npm start
```

### Vercel 部署

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 自动部署完成

## 项目结构

```
src/
├── app/                 # Next.js App Router
│   ├── globals.css     # 全局样式
│   ├── layout.tsx      # 根布局
│   └── page.tsx        # 主页面
├── components/          # React 组件
│   ├── AppItem.tsx     # 应用项组件
│   └── AddAppItem.tsx  # 添加应用组件
```

## 自定义配置

### 修改默认应用

在 `src/app/page.tsx` 中修改 `defaultApps` 数组：

```typescript
const defaultApps: App[] = [
  {
    name: '你的AI应用',
    url: 'https://your-ai-app.com',
    icon: 'https://favicon.im/your-ai-app.com'
  }
]
```

### 修改样式

- 全局样式：`src/app/globals.css`
- 组件样式：使用 Tailwind CSS 类名或内联样式

## 部署到 Vercel

1. 确保项目根目录包含 `vercel.json`
2. 连接 GitHub 仓库到 Vercel
3. 选择 Next.js 框架
4. 自动部署

## 许可证

MIT License
