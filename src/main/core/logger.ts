// 轻量文件日志（主进程），写入 logs/app.log，超过 5MB 轮转一次
import fs from 'node:fs'
import path from 'node:path'

type Level = 'info' | 'warn' | 'error' | 'debug'

const MAX_SIZE = 5 * 1024 * 1024

class Logger {
  private file: string | null = null

  init(logsDir: string): void {
    try {
      fs.mkdirSync(logsDir, { recursive: true })
      this.file = path.join(logsDir, 'app.log')
    } catch {
      this.file = null
    }
  }

  private write(level: Level, msg: string): void {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
    if (level === 'error') process.stderr.write(line)
    else process.stdout.write(line)
    if (this.file) {
      try {
        const st = fs.existsSync(this.file) ? fs.statSync(this.file) : null
        if (st && st.size > MAX_SIZE) {
          fs.renameSync(this.file, this.file + '.1')
        }
        fs.appendFileSync(this.file, line)
      } catch {
        /* 日志失败不影响主流程 */
      }
    }
  }

  info(msg: string): void {
    this.write('info', msg)
  }
  warn(msg: string): void {
    this.write('warn', msg)
  }
  error(msg: string): void {
    this.write('error', msg)
  }
  debug(msg: string): void {
    this.write('debug', msg)
  }
}

export const logger = new Logger()
