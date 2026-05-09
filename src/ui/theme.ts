/**
 * UI主题定义
 * 256色调色板，保证Windows Terminal兼容
 */

export interface Theme {
  text: string;
  dim: string;
  accent: string;
  success: string;
  error: string;
  warning: string;

  chip: string;
  cardRed: string;
  cardBlack: string;
  cardBorder: string;
  cardBack: string;

  border: string;
  highlight: string;
  dealer: string;
  tableFg: string;
  tableBg: string;

  phaseTitle: string;
  bold: string;
  reset: string;
}

export const defaultTheme: Theme = {
  // 基础
  text:        '\x1b[37m',        // 白色
  dim:         '\x1b[38;5;8m',   // 灰色(bright black)
  accent:      '\x1b[36m',        // 青色
  success:     '\x1b[32m',        // 绿色
  error:       '\x1b[31m',        // 红色
  warning:     '\x1b[33m',        // 黄色

  // 扑克专用
  chip:        '\x1b[33m',        // 筹码=金色
  cardRed:     '\x1b[31m',        // 红牌=红色
  cardBlack:   '\x1b[37m',        // 黑牌=白色
  cardBorder:  '\x1b[38;5;8m',   // 牌框=灰色
  cardBack:    '\x1b[34m',        // 牌背=蓝色

  // UI元素
  border:      '\x1b[38;5;8m',   // 边框=灰色
  highlight:   '\x1b[32;1m',     // 当前玩家=亮绿
  dealer:      '\x1b[33;1m',     // 庄家标记=亮黄
  tableFg:     '\x1b[97m',       // 桌面文字=亮白
  tableBg:     '\x1b[48;5;22m', // 桌面背景=暗绿

  phaseTitle:  '\x1b[1;36m',     // 阶段标题=粗体青

  bold:        '\x1b[1m',
  reset:       '\x1b[0m',
};

/**
 * 在文本前后包裹主题颜色
 */
export function themed(text: string, color: string): string {
  return color + text + defaultTheme.reset;
}

/**
 * 金色筹码文字
 */
export function chipText(amount: number): string {
  return `${defaultTheme.chip}$${amount}${defaultTheme.reset}`;
}
