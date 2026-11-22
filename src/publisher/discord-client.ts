import { logger } from "../observability/logger.js";
import { RateLimiter } from "./rate-limiter.js";
import type { DiscordWebhookPayload } from "../domain/models.js";

export interface SendResult {
  success: boolean;
  messageId?: string;
  statusCode?: number;
  durationMs: number;
  error?: string;
  retryAfterSeconds?: number;
}

export class DiscordClient {
  private rateLimiter: RateLimiter;

  constructor(
    private isDryRun: boolean = false,
    minIntervalMs: number = 800,
  ) {
    this.rateLimiter = new RateLimiter(minIntervalMs);
  }

  async sendWebhook(
    webhookUrl: string,
    payload: DiscordWebhookPayload,
  ): Promise<SendResult> {
    const startTime = Date.now();

    if (this.isDryRun) {
      logger.info(
        "[DRY-RUN] Simulação de envio ao Discord Webhook bem-sucedida:",
        {
          embedTitle: payload.embeds[0]?.title,
          fieldsCount: payload.embeds[0]?.fields?.length,
        },
      );
      return {
        success: true,
        messageId: `dry_run_${Date.now()}`,
        statusCode: 200,
        durationMs: Date.now() - startTime,
      };
    }

    if (
      !webhookUrl ||
      !webhookUrl.startsWith("https://discord.com/api/webhooks/")
    ) {
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: "URL de webhook Discord inválida ou ausente.",
      };
    }

    await this.rateLimiter.acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${webhookUrl}?wait=true`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "JobRadar/1.0 (+https://github.com/job-radar)",
        },
        body: JSON.stringify(payload),
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : 5;

        logger.warn(
          `Rate limit do Discord atingido (429). Retry-After: ${retryAfterSeconds}s`,
        );

        return {
          success: false,
          statusCode: 429,
          durationMs,
          retryAfterSeconds,
          error: `Discord 429: aguarde ${retryAfterSeconds} segundos`,
        };
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return {
          success: false,
          statusCode: response.status,
          durationMs,
          error: `HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
        };
      }

      const responseData = (await response.json().catch(() => ({}))) as {
        id?: string;
      };

      return {
        success: true,
        statusCode: response.status,
        messageId: responseData.id || `msg_${Date.now()}`,
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;

      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          durationMs,
          error: "Timeout de 10s excedido ao enviar mensagem ao Discord.",
        };
      }

      return {
        success: false,
        durationMs,
        error: (err as Error).message,
      };
    }
  }
}
