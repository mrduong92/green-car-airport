export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

const ts = () => new Date().toISOString()

export const logger: Logger = {
  info: (...args) => console.log(ts(), ...args),
  warn: (...args) => console.warn(ts(), ...args),
  error: (...args) => console.error(ts(), ...args),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }
