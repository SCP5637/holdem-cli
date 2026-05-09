# 德州扑克 CLI

终端里运行德州扑克 — 全 ASCII 渲染、方向键交互、支持联网对战。

## 快速开始

```bash
npm install
npm run build
npm start
```

需要 Node.js >= 16。

## 功能

- **2-8 人对战**，支持本地 / 局域网联机(主机-客户端) / AI + LLM 混合
- **全屏 TUI** — 方向键导航菜单、窗口自适应、阶段动画
- **ASCII 扑克牌** — 4 色花色 + 4 级密度自适应(完整/紧凑/标签/纯文本)
- **AI 对手** — 5 个难度、14 种策略 (rock → nashApprox)，强如怪物拼尽全力无法战胜
- **LLM 接入** — OpenAI 兼容 API，支持自定义设置

## 运行模式

启动后主菜单可选：

| 模式     | 说明             |
| ------ | -------------- |
| 本地游戏   | 单人 vs AI / LLM |
| 创建联机房间 | 作为主机，其他客户端可加入  |
| 加入联机房间 | 连接到主机游戏        |

## AI 难度

| 难度     | 策略数 | 特点                                           |
| ------ | --- | -------------------------------------------- |
| Low    | 3   | rock、callingStation、beginner                 |
| Medium | 3   | tagBasic、abcSolid、lagBasic                   |
| High   | 3   | calculator、trapper、aggressor                 |
| Ultra  | 3   | gtoBalanced、exploitative、hybrid — GTO + 对手剥削 |
| Max    | 2   | 快跑                                           |

## LLM 预设

主菜单 → 管理 LLM API 预设，配置 OpenAI 兼容 API：

```
预设名称: my-gpt
API Base URL: https://api.openai.com/v1
API Key: sk-xxxxxxxx
模型: gpt-4o-mini
```

## 脚本

```bash
npm run dev      # tsx 热执行 + debug 日志
npm run build    # tsc 编译
npm start        # 运行编译产物
npm run package  # pkg 打包为 holdem.exe
```

调试日志保存在 `.holdem-local/logs/`。

## 操作键位

| 位置    | 键        | 作用             |
| ----- | -------- | -------------- |
| 菜单/配置 | ↑↓ / 数字键 | 导航选择           |
| 菜单/配置 | Enter    | 确认             |
| 菜单/配置 | Esc      | 返回/取消          |
| 游戏中   | 1-5      | 弃牌/过牌/跟注/加注/全押 |

## 许可证

MIT
