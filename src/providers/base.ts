import {
  AppError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  ProviderError,
} from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import type {
  JobProvider,
  NormalizedJob,
  SourceConfig,
} from "../domain/models.js";

export interface RequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export async function fetchWithRetryAndTimeout(
  url: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "JobRadar/1.0 (+https://github.com/job-radar)",
          Accept: "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Tratamento de Rate Limit (HTTP 429)
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : Math.min(60, Math.pow(2, attempt));

        logger.warn(
          `Rate limit (429) recebido para ${url}. Aguardando ${retryAfterSeconds}s...`,
        );

        if (attempt >= maxRetries) {
          throw new RateLimitError(
            `Rate limit excedido após ${maxRetries} tentativas para ${url}`,
            retryAfterSeconds,
          );
        }

        await new Promise((res) => setTimeout(res, retryAfterSeconds * 1000));
        continue;
      }

      // Tratamento de erros HTTP 5xx (temporários, retentáveis)
      if (response.status >= 500) {
        if (attempt >= maxRetries) {
          throw new NetworkError(
            `Falha HTTP ${response.status} após ${maxRetries} tentativas ao acessar ${url}`,
          );
        }
        const backoffMs = Math.min(
          10000,
          Math.pow(2, attempt) * 500 + Math.random() * 200,
        );
        await new Promise((res) => setTimeout(res, backoffMs));
        continue;
      }

      // Tratamento de erros HTTP 4xx (não retentáveis, exceto 429)
      if (!response.ok) {
        throw new NetworkError(
          `Erro HTTP ${response.status} ao acessar ${url}`,
        );
      }

      const text = await response.text();
      // Proteção de tamanho de resposta (máximo 15MB)
      if (text.length > 15 * 1024 * 1024) {
        throw new NetworkError(
          "Resposta excedeu o tamanho máximo permitido de 15MB",
        );
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new ProviderError(
          "BaseProvider",
          `Resposta de ${url} não é um JSON válido`,
        );
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof AppError) {
        if (err instanceof RateLimitError) throw err;
        if (attempt >= maxRetries) throw err;
      } else if (err instanceof Error) {
        if (err.name === "AbortError") {
          if (attempt >= maxRetries) {
            throw new TimeoutError(
              `Timeout de ${timeoutMs}ms excedido ao requisitar ${url}`,
            );
          }
        } else {
          if (attempt >= maxRetries) {
            throw new NetworkError(
              `Falha de rede ao acessar ${url}: ${err.message}`,
            );
          }
        }
      }

      const backoffMs = Math.min(
        5000,
        Math.pow(2, attempt) * 400 + Math.random() * 100,
      );
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  throw new NetworkError(
    `Falha após ${maxRetries} tentativas ao acessar ${url}`,
  );
}

export type { JobProvider, NormalizedJob, SourceConfig };
