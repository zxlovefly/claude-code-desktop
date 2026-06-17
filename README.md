# Claude Code Desktop

> 将 Claude Code CLI 封装为桌面应用，保留全部功能，并增加模型切换、流量监控、自动化工作流等高级特性。

![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![electron](https://img.shields.io/badge/electron-35.x-9feaf9)
![react](https://img.shields.io/badge/react-19.x-61dafb)
![license](https://img.shields.io/badge/license-MIT-green)

<p align="center">
  <img src="https://img.shields.io/badge/📊-流量监控-green" />
  <img src="https://img.shields.io/badge/🤖-自动化调度-orange" />
  <img src="https://img.shields.io/badge/🌐-多标签会话-purple" />
  <img src="https://img.shields.io/badge/⚠️-模型切换已移除-red" />
</p>

---

## ✨ 功能

| 功能 | 说明 |
|---|---|
| **Claude Code 完整终端** | PTY 虚拟终端，100% 保留 CLI 所有功能（MCP 工具、插件、Hooks） |
| **实时流量监控** | 解析 `~/.claude/projects/*/session.jsonl`，展示 Token 消耗、缓存命中率、预估费用 |
| **自动化调度引擎** | 预设 12 个模板 + 自定义表单，支持单次/每天/按间隔执行，精确到分钟 |
| **多标签终端** | 不同目录并行运行多个 Claude Code 会话 |
| **状态栏** | 实时显示当前模型、费用、会话数、工作目录 |
| **模型只读展示** | 顶部栏和状态栏显示当前模型名称（切换请使用 `claude` CLI 的 `/model` 命令或直接编辑 settings.json） |

---

## 🎬 界面

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

---

## ⚠️ 重要提醒：模型切换功能已移除

**请不要使用本应用进行模型切换操作。** 早期版本包含内置的模型切换 UI（可视化切换不同 AI 提供商的模型），但在实际使用中可能出现以下问题：

### 可能出现的 Bug

| 问题 | 触发条件 |
|---|---|
| **切换到其他厂商后无法切回原厂商** | key 解析回退链可能读取正在修改中的 `env` 副本，导致跨厂商的 `ANTHROPIC_AUTH_TOKEN` 污染 — DeepSeek 的 key 被写到 `ANTHROPIC_AUTH_TOKEN`，切回 Claude 时读到的仍是 DeepSeek 的 key |
| **在 Sidebar 配置 Key 后模型列表不更新** | `handleSetApiKey()` 只调用了 `config:set` 写入 `settings.json`，没写入 `keys.json`，导致 `switchModel` 按 `keys.json[providerId]` 查找不到 key |
| **自动化执行卡死** | auto-send 路径下直接调用 `chat:send-message` 可能与正在进行的 stream 产生竞态条件，`session.abortController?.abort()` 可能杀死当前活跃请求 |
| **切页面后 prompt 重复填充** | auto-send 路径不经过 ChatInput 的 `onConsumed()`，`filledPrompt` 未被清空，切页再回来时重新填充 |
| **Chat Service key 解析拿到错误的 Key** | `getApiConfig()` 找不到 `keys.json[providerId]` 时回退到 `env.ANTHROPIC_AUTH_TOKEN`，可能拿到其他厂商的 key，导致 API 调用失败或费用异常 |

### 建议做法

**如需切换模型，请直接编辑 `~/.claude/settings.json`：**

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-api-key-here"
  }
}
```

或者使用 Claude Code CLI 自带的 `/model` 命令在终端内切换：

```
/model deepseek-v4-flash
```

> ⚡ 本应用仅保留模型名称的**只读展示**（顶部栏和状态栏），所有切换入口已被移除。

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
│       ├── model.service.ts       # 模型信息读取（只读）
│       ├── proxy.service.ts       # 流量监控（解析 JSONL）
│       ├── config.service.ts      # 配置管理
│       └── scheduler.service.ts   # 自动化调度引擎
├── preload/                       # 安全通信桥
│   └── index.ts
├── renderer/                      # React UI
│   ├── App.tsx                    # 根组件
│   ├── components/
│   │   ├── Terminal/              # xterm.js 终端 + 多标签
│   │   ├── Sidebar/               # 流量监控、自动化面板
│   │   └── StatusBar/             # 底部状态栏
│   └── stores/                    # Zustand 状态管理
└── shared/                        # 共享类型定义
    └── types.ts
```

---

## 🔧 配置说明

### 模型配置

模型信息（名称、服务商）从 `~/.claude/settings.json` 中的 `env.ANTHROPIC_MODEL` 和 `env.ANTHROPIC_BASE_URL` 读取。

本应用**不支持 UI 切换模型**。如需切换，请使用以下方式之一：

**方式一：使用 Claude Code CLI 自带的 `/model` 命令**
在终端中输入：
```
/model deepseek-v4-flash
```

**方式二：直接编辑 `~/.claude/settings.json`**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_MODEL": "deepseek-v4-pro",
    "ANTHROPIC_AUTH_TOKEN": "sk-your-api-key"
  }
}
```

> ⚠️ 不正确的模型切换可能导致 API Key 混乱。推荐仅使用 `claude` CLI 的 `/model` 命令进行切换。

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
