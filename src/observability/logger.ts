export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  [key: string]: unknown;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Mascara tokens de Discord webhook (ex: https://discord.com/api/webhooks/123/abc...)
    let sanitized = value.replace(
      /(https:\/\/discord\.com\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]+/g,
      "$1[REDACTED_WEBHOOK_TOKEN]",
    );
    // Mascara senhas em URLs de conexão postgresql://user:pass@host...
    sanitized = sanitized.replace(
      /(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/g,
      "$1[REDACTED_PASSWORD]$2",
    );
    // Mascara chaves de API genéricas
    sanitized = sanitized.replace(
      /(bearer\s+)[A-Za-z0-9_.-]+/gi,
      "$1[REDACTED_TOKEN]",
    );
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === "object") {
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("credential") ||
        lower.includes("webhook")
      ) {
        if (typeof v === "string" && v.startsWith("http")) {
          cleanObj[k] = sanitizeValue(v);
        } else {
          cleanObj[k] = "[REDACTED]";
        }
      } else {
        cleanObj[k] = sanitizeValue(v);
      }
    }
    return cleanObj;
  }

  return value;
}

export class Logger {
  private level: LogLevel = "info";

  constructor(level?: LogLevel) {
    if (level) {
      this.level = level;
    } else if (process.env.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toLowerCase() as LogLevel;
      if (LOG_LEVELS[envLevel] !== undefined) {
        this.level = envLevel;
      }
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(context ? { context: sanitizeValue(context) } : {}),
    };

    const formatted = JSON.stringify(entry);

    if (level === "error") {
      console.error(formatted);
    } else if (level === "warn") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }
}

export const logger = new Logger();
