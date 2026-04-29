import type { LogLevel } from '../models'

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

interface LoggerConfig {
  logLevel?: LogLevel
  logHandler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
}

export class Logger {
  private readonly level: number
  private readonly handler?: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void

  constructor(config: LoggerConfig = {}) {
    this.level = LEVELS[config.logLevel ?? 'warn']
    this.handler = config.logHandler
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVELS[level] > this.level) return
    if (this.handler) {
      this.handler(level, message, meta)
      return
    }
    const metaStr = meta ? JSON.stringify(meta) : ''
    const methods: Record<LogLevel, keyof Console> = {
      silent: 'log',
      error: 'error',
      warn: 'warn',
      info: 'info',
      debug: 'debug',
    }
    ;(console[methods[level]] as Function)(`[${level}] ${message}`, metaStr)
  }

  error(message: string, meta?: Record<string, unknown>): void { this.log('error', message, meta) }
  warn(message: string, meta?: Record<string, unknown>): void { this.log('warn', message, meta) }
  info(message: string, meta?: Record<string, unknown>): void { this.log('info', message, meta) }
  debug(message: string, meta?: Record<string, unknown>): void { this.log('debug', message, meta) }
}
