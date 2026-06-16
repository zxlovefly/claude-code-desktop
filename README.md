# Claude Code Desktop

> 将 Claude Code CLI 封装为桌面应用，保留全部功能，并增加模型切换、流量监控、自动化工作流等高级特性。

![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![electron](https://img.shields.io/badge/electron-35.x-9feaf9)
![react](https://img.shields.io/badge/react-19.x-61dafb)
![license](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="https://img.shields.io/badge/⚡-模型切换-blue" />
  <img src="https://img.shields.io/badge/📊-流量监控-green" />
  <img src="https://img.shields.io/badge/🤖-自动化调度-orange" />
  <img src="https://img.shields.io/badge/🌐-多标签会话-purple" />
</p>

---

## ✨ 功能

| 功能 | 说明 |
|---|---|
| **Claude Code 完整终端** | PTY 虚拟终端，100% 保留 CLI 所有功能（MCP 工具、插件、Hooks） |
| **模型一键切换** | 可视化切换 8 个提供商、13+ 模型预设，自动更新 settings.json |
| **API Key 面板配置** | 未配置 Key 的厂商可直接在面板中粘贴 Key，无需手动编辑文件 |
| **实时流量监控** | 解析 `~/.claude/projects/*/session.jsonl`，展示 Token 消耗、缓存命中率、预估费用 |
| **自动化调度引擎** | 预设 12 个模板 + 自定义表单，支持单次/每天/按间隔执行，精确到分钟 |
| **多标签终端** | 不同目录并行运行多个 Claude Code 会话 |
| **状态栏** | 实时显示当前模型、费用、会话数、工作目录 |

---

## 🎬 界面

```
┌──────────────────────────────────────────────────┐
│  [⚡模型] [📊流量] [🤖自动化]      │  Terminal    │
│                                    │              │
│  ┌ 当前模型 ────────────────────┐  │  ┌────────┐  │
│  │ DeepSeek V4 Pro [1M]        │  │  │ Claude  │  │
│  │ DeepSeek                    │  │  │ Code    │  │
│  └─────────────────────────────┘  │  │ CLI     │  │
│                                    │  │         │  │
│  ┌ 提供商 ────────────────────┐    │  │         │  │
│  │ ▸ DeepSeek      已配置     │    │  │         │  │
│  │   ├ V4 Pro [1M]           │    │  │         │  │
│  │   ├ V4 Flash              │    │  └────────┘  │
│  │ ▸ Anthropic    未配置 Key │    │              │
│  │ ▸ OpenRouter   未配置 Key │    │              │
│  └───────────────────────────┘    │              │
├────────────────────────────────────┤──────────────┤
│  🟢 DeepSeek V4 Pro │ ¥0.0234 │ 2 会话 │ ~/Desktop │
└──────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 开发环境

```bash
# 克隆仓库
git clone https://github.com/zxlovefly/claude-code-desktop.git
cd claude-code-desktop

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 打包为 EXE (Windows)
npm run package
```

### 直接使用

下载 [Releases](https://github.com/zxlovefly/claude-code-desktop/releases) 中的 `Claude Code Desktop.exe`，双击运行。

---

## 📋 前置要求

- **Node.js** >= 22.x（仅开发时需要）
- **Claude Code CLI** 已安装并可在终端运行（`claude` 命令可用）
  - 安装：`npm install -g @anthropic-ai/claude-code`
- Windows 10+ / macOS 12+ / Linux

> 🔔 如果未安装 Claude Code CLI，桌面端启动后会显示红色提示条。

---

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 35 |
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| 终端 | xterm.js + node-pty |
| 布局 | allotment (VS Code 风格分栏) |
| 状态管理 | Zustand 5 |
| 构建 | electron-vite + electron-builder |
| 调度引擎 | 内置 setTimeout 精确到秒 |

---

## 📂 项目结构

```
src/
├── main/                          # Electron 主进程
│   ├── index.ts                   # 窗口创建、生命周期
│   ├── ipc.ts                     # IPC 通信注册
│   └── services/
│       ├── terminal.service.ts    # PTY 终端管理
│       ├── model.service.ts       # 模型切换（读写 settings.json）
│       ├── proxy.service.ts       # 流量监控（解析 JSONL）
│       ├── config.service.ts      # 配置管理
│       └── scheduler.service.ts   # 自动化调度引擎
├── preload/                       # 安全通信桥
│   └── index.ts
├── renderer/                      # React UI
│   ├── App.tsx                    # 根组件
│   ├── components/
│   │   ├── Terminal/              # xterm.js 终端 + 多标签
│   │   ├── Sidebar/               # 模型切换、流量监控、自动化面板
│   │   └── StatusBar/             # 底部状态栏
│   └── stores/                    # Zustand 状态管理
└── shared/                        # 共享类型定义
    └── types.ts
```

---

## 🔧 配置说明

### 模型配置

模型列表读取自 `~/.claude/providers.json`，切换模型时自动修改 `~/.claude/settings.json` 中的环境变量。

支持的提供商：

| 提供商 | 需要配置的环境变量 |
|---|---|
| DeepSeek | `ANTHROPIC_AUTH_TOKEN` |
| Anthropic | `ANTHROPIC_AUTH_TOKEN` |
| OpenRouter | `ANTHROPIC_AUTH_TOKEN` |
| DashScope (阿里) | `DASHSCOPE_API_KEY` |
| Zhipu (智谱) | `ZHIPU_API_KEY` |
| Moonshot (月之暗面) | `MOONSHOT_API_KEY` |
| Xiaomi (小米) | `MIMO_API_KEY` |
| 自定义 | `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` |

## 🤖 自动化调度

### 预设模板

| 模板 | 默认频率 |
|---|---|
| 📰 每日 AI 新闻推送 | 每天 08:00 |
| 📝 每日 5 个英语单词 | 每天 09:00 |
| 🌙 每日儿童睡前故事 | 每天 20:30 |
| 📊 每周工作周报 | 每天 17:00 |
| 🎬 经典电影推荐 | 每天 12:00 |
| 📅 历史上的今天 | 每天 07:00 |
| ❓ 每日一个为什么 | 每天 10:00 |
| 📞 父母联系提醒 | 每天 10:00 |
| 🏥 体检预约提醒 | 单次 |
| 💼 面试准备提醒 | 每 120 分钟 |
| 📋 会议前准备 | 每天 08:30 |
| 🐱 可爱萌宠手机壁纸 | 每天 06:00 |

### 自定义任务

支持三种执行频率：

- **单次**：指定日期+时间执行一次，不填时间则立即执行
- **每天**：每日定时执行，到点自动创建终端发送 prompt
- **按间隔**：每隔 N 分钟循环执行

所有任务持久化到 `~/.claude/automation-tasks.json`，应用重启后自动恢复。

### 调度原理

采用 `setTimeout` 精确计算目标时间的毫秒差，到点即触发，不依赖轮询。

```
添加任务 → computeDelay() → msUntil(目标时间) → setTimeout
                              ↓
                         到点触发 executeTask()
                              ↓
                    主进程 emit('executed')
                              ↓
                    App.tsx 监听 → 创建终端 → 发送 prompt → 自动切标签
```

---

## 🏗️ 构建 & 打包

```bash
# 构建
npm run build

# 打包为 Windows 便携版
npm run package

# 输出
# dist/win-unpacked/Claude Code Desktop.exe  (~290MB)
```

---

## 📄 License

MIT

---

> 🤖 本项目由 [Claude Code](https://claude.ai/code) (Anthropic) 辅助生成，包括代码、文档及自动化工作流设计。

---

## 🙏 致谢

- [Claude Code](https://claude.ai/code) - Anthropic 的 AI 编程 CLI 工具
- [xterm.js](https://xtermjs.org/) - 终端模拟器
- [node-pty](https://github.com/microsoft/node-pty) - PTY 伪终端
- [electron-vite](https://electron-vite.org/) - Electron 构建工具
