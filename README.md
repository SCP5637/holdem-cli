# Holdem-CLI

终端里的德州扑克 — ASCII 卡牌、方向键交互、AI 对手、联网对战。

## 这是什么

一个跑在命令行里的完整德州扑克游戏。没有浏览器，没有 GUI，只有终端和键盘。支持本地人机对战、局域网多人联机，以及接入 LLM（大语言模型）作为 AI 对手。

## 快速开始

如果你看不懂↓下面↓这些是什么，没关系，右边的Release，点进去，找最新的版本号，下载下面的holdem压缩包，解压即玩

```bash
git clone https://github.com/SCP5637/holdem-cli.git && cd holdem-cli
npm install
npm run build
npm start
```

需要 Node.js >= 18。

开发模式（实时执行源码 + 调试日志）：

```bash
npm run dev
```

## 能干什么

- **本地游戏** — 1 人 vs 7 AI/LLM，8 人满桌
- **联机对战** — 一人建主机，其他人 TCP 连入，同局域网即可
- **AI 智能体** — 5 个难度等级、14 种策略风格，从"石头"到近似纳什均衡
- **LLM 牌手** — 接入 OpenAI 兼容 API，让大模型替你打牌，可混搭 AI/LLM/真人
- **全屏 TUI** — 方向键切选项、数字键快捷选、Esc 退出，自适应终端尺寸
- **ASCII 扑克牌** — 四花色渲染，根据终端宽度自动切换 4 级密度
- **阶段动画** — 翻牌/转牌/河牌有过场进度条
- **行动日志** — 实时滚动记录每一手牌的所有操作

## 运行模式

启动后进入主菜单，三选一：

| 模式     | 说明                       |
| ------ | ------------------------ |
| 本地游戏   | 1 个真人 + 若干 AI / LLM，打完走人 |
| 创建联机房间 | 你当房主，配置座位，等其他玩家加入        |
| 加入联机房间 | 输入主机 IP + 端口，选座加入        |

联机模式下，每个座位可指定为：房主、AI、LLM、远程玩家。

## AI 对手

14 种策略分布 5 个难度：

| 难度     | 策略数 | 风格                              |
| ------ | --- | ------------------------------- |
| Low    | 3   | rock、callingStation、beginner    |
| Medium | 3   | tagBasic、abcSolid、lagBasic      |
| High   | 3   | calculator、trapper、aggressor    |
| Ultra  | 3   | gtoBalanced、exploitative、hybrid |
| Max    | 2   | fullAdaptive、nashApprox         |

AI 会计算手牌强度、底池赔率、位置因子，会诈唬、半诈唬、价值下注，也会根据你的 VPIP/PFR 调整策略。

## LLM 接入

主菜单 → 管理 LLM API 预设。填入 OpenAI 兼容接口信息即可：

```
预设名称: deepseek
API Base URL: https://api.deepseek.com/v1
API Key: sk-xxxxxxxx
模型: deepseek-chat
```

预设保存在本地 `.holdem-local/`，不会上传。LLM 超时或异常时自动降级为 AI 代打。

## 键位

| 位置  | 键        | 作用                     |
| --- | -------- | ---------------------- |
| 菜单  | ↑↓ / 数字键 | 导航选择                   |
| 菜单  | Enter    | 确认                     |
| 菜单  | Esc      | 返回 / 取消                |
| 游戏中 | 1-5      | 弃牌 / 过牌 / 跟注 / 加注 / 全押 |
| 游戏中 | ←→       | 切换动作选项                 |
| 游戏中 | ↑↓       | 滚动行动日志                 |
| 游戏中 | F        | 强制刷新画面                 |
| 任意  | Ctrl+C   | 退出                     |

加注时直接输入金额，回车确认。联机方按 F 会向主机请求刷新对局状态。

## 打包

把整个游戏打成单个 Windows exe，无需安装 Node.js：

```bash
npm run package
# → holdem/holdem-cli.exe (~14MB)
```

## 许可证

MIT
