import * as fs from 'fs/promises';
import * as path from 'path';

const LOGS_DIR = '.logs';
const LATEST_LOG = 'latest.log';

interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  data?: unknown;
}

class Logger {
  private static instance: Logger;
  private isDebugMode: boolean = false;
  private logBuffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  async initialize(debugMode: boolean = false): Promise<void> {
    if (this.initialized) return;

    this.isDebugMode = debugMode;

    if (this.isDebugMode) {
      await this.ensureLogDirectory();
      await this.clearLatestLog();

      // 每 5 秒刷新一次日志到文件
      this.flushInterval = setInterval(() => this.flush(), 5000);

      this.log('INFO', 'LOGGER', '调试日志系统已启动');
    }

    this.initialized = true;
  }

  async destroy(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
    this.initialized = false;
  }

  private async ensureLogDirectory(): Promise<void> {
    const logDir = path.join(process.cwd(), LOGS_DIR);
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      console.error('创建日志目录失败:', error);
    }
  }

  private async clearLatestLog(): Promise<void> {
    const logPath = path.join(process.cwd(), LOGS_DIR, LATEST_LOG);
    try {
      await fs.writeFile(logPath, '', 'utf-8');
    } catch (error) {
      console.error('清空日志文件失败:', error);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const dataStr = entry.data ? ` | DATA: ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.category}] ${entry.message}${dataStr}\n`;
  }

  private log(level: LogEntry['level'], category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data
    };

    const logLine = this.formatLogEntry(entry);

    // 控制台输出（仅 ERROR 和 WARN 默认输出到控制台，DEBUG 模式下全部输出）
    if (this.isDebugMode || level === 'ERROR' || level === 'WARN') {
      const consoleMethod = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
      consoleMethod(`[${level}] [${category}] ${message}`);
    }

    // 写入日志缓冲区
    if (this.isDebugMode) {
      this.logBuffer.push(logLine);
    }
  }

  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logPath = path.join(process.cwd(), LOGS_DIR, LATEST_LOG);
    const content = this.logBuffer.join('');
    this.logBuffer = [];

    try {
      await fs.appendFile(logPath, content, 'utf-8');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  // 公共日志方法
  debug(category: string, message: string, data?: unknown): void {
    this.log('DEBUG', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.log('INFO', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.log('WARN', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.log('ERROR', category, message, data);
  }

  // LLM 专用日志方法
  logLLMRequest(presetName: string, requestData: unknown): void {
    this.debug('LLM', `发送请求 [${presetName}]`, requestData);
  }

  logLLMResponse(presetName: string, responseData: unknown): void {
    this.debug('LLM', `收到响应 [${presetName}]`, responseData);
  }

  logLLMThinking(presetName: string, thinking: string): void {
    this.debug('LLM', `思考过程 [${presetName}]`, { thinking });
  }

  logLLMError(presetName: string, error: Error): void {
    this.error('LLM', `调用失败 [${presetName}]`, { error: error.message, stack: error.stack });
  }

  // 游戏操作日志
  logGameAction(playerName: string, action: string, amount?: number): void {
    this.info('GAME', `玩家操作 [${playerName}]`, { action, amount });
  }

  logGameState(phase: string, state: unknown): void {
    this.debug('GAME', `游戏状态 [${phase}]`, state);
  }

  logPhaseChange(fromPhase: string, toPhase: string): void {
    this.info('GAME', `阶段切换`, { from: fromPhase, to: toPhase });
  }

  // 获取调试模式状态
  isDebugEnabled(): boolean {
    return this.isDebugMode;
  }
}

// 导出单例实例
export const logger = Logger.getInstance();
