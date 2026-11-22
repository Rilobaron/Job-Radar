export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "NETWORK_ERROR", details);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "TIMEOUT_ERROR", details);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    public readonly retryAfterSeconds?: number,
    details?: unknown,
  ) {
    super(message, "RATE_LIMIT_ERROR", details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "DATABASE_ERROR", details);
  }
}

export class ProviderError extends AppError {
  constructor(
    public readonly provider: string,
    message: string,
    details?: unknown,
  ) {
    super(`[${provider}] ${message}`, "PROVIDER_ERROR", details);
  }
}
