import winston from 'winston';
import { ENV } from './env.js';

// Redact sensitive keys from log output
const sensitiveKeys = ['password', 'secret', 'key', 'token', 'payload', 'initData', 'hash', 'signature'];

const redactSensitive = winston.format((info) => {
  const mask = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const key of Object.keys(copy)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        copy[key] = '***REDACTED***';
      } else if (typeof copy[key] === 'object') {
        copy[key] = mask(copy[key]);
      }
    }
    return copy;
  };

  return mask(info);
});

export const logger = winston.createLogger({
  level: ENV.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    redactSensitive(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    ENV.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `[${timestamp}] [${level}]: ${message}${metaStr}`;
          })
        )
  ),
  defaultMeta: { service: 'daramini-api' },
  transports: [
    new winston.transports.Console()
  ]
});
