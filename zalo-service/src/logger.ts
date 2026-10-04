export interface Logger {
  info(...args: unknown[]): void
  error(...args: unknown[]): void
}

const ts = () => new Date().toISOString()

export const logger: Logger = {
  info: (...args) => console.log(ts(), ...args),
  error: (...args) => console.error(ts(), ...args),
}

export const silentLogger: Logger = { info() {}, error() {} }
