import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DiscordClient } from "../../src/publisher/discord-client.js";
import type { DiscordWebhookPayload } from "../../src/domain/models.js";

describe("DiscordClient (Integration & Resilience)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const dummyPayload: DiscordWebhookPayload = {
    embeds: [
      {
        title: "Test Embed",
        url: "https://example.com",
        fields: [{ name: "Field 1", value: "Value 1" }],
      },
    ],
    allowed_mentions: { parse: [] },
  };

  it("deve operar com sucesso em modo DRY_RUN sem disparar requisição HTTP real", async () => {
    global.fetch = vi.fn();
    const client = new DiscordClient(true);

    const result = await client.sendWebhook(
      "https://discord.com/api/webhooks/123/mock-token",
      dummyPayload,
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toContain("dry_run_");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("deve enviar com sucesso quando o webhook responder 200 OK", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "discord_real_message_123" }),
    } as any);

    const client = new DiscordClient(false, 0);
    const result = await client.sendWebhook(
      "https://discord.com/api/webhooks/123/valid-token",
      dummyPayload,
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("discord_real_message_123");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("deve capturar Retry-After quando receber HTTP 429", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "12" }),
    } as any);

    const client = new DiscordClient(false, 0);
    const result = await client.sendWebhook(
      "https://discord.com/api/webhooks/123/rate-limited",
      dummyPayload,
    );

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.retryAfterSeconds).toBe(12);
    expect(result.error).toContain("Discord 429");
  });

  it("deve rejeitar URLs que não pertençam ao domínio oficial do Discord", async () => {
    const client = new DiscordClient(false, 0);
    const result = await client.sendWebhook(
      "https://evil-site.com/steal-data",
      dummyPayload,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("URL de webhook Discord inválida");
  });
});
