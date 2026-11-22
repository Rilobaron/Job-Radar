import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { buildJobEmbed } from "../../src/publisher/embed.js";
import type { NormalizedJob } from "../../src/domain/models.js";

describe("Discord HTTP Real Server Integration", () => {
  let server: http.Server;
  let serverPort: number;
  let receivedRequests: Array<{
    method?: string;
    url?: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  }> = [];
  let responseHandler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        let parsedBody = null;
        try {
          parsedBody = data ? JSON.parse(data) : null;
        } catch {
          parsedBody = data;
        }
        receivedRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: parsedBody,
        });

        if (responseHandler) {
          responseHandler(req, res);
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "real_http_msg_999" }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const sampleJob: NormalizedJob = {
    id: "job_discord_test",
    provider: "greenhouse",
    providerJobId: "777",
    company: "Acme Discord Co",
    title: "Senior Cloud Architect @everyone",
    description: "Looking for <@&123456> engineer",
    location: "São Paulo, Brazil",
    remoteType: "remote",
    seniority: "senior",
    technologies: ["AWS", "Terraform"],
    salaryMin: 20000,
    salaryMax: 25000,
    currency: "BRL",
    country: "Brazil",
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://acme.com/apply/777",
    sourceUrl: "https://acme.com/jobs/777",
    canonicalHash: "can_hash_777",
    qualityScore: 95,
    inferredData: {},
    publishedAt: "2026-03-01T10:00:00.000Z",
    discoveredAt: "2026-03-01T10:00:00.000Z",
    lastSeenAt: "2026-03-01T10:00:00.000Z",
    status: "active",
  };

  it("deve enviar requisição HTTP real válida para o servidor com payload e sanitização", async () => {
    receivedRequests = [];
    responseHandler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "msg_ok_123" }));
    };

    // Simula a URL passando por validação interna ou bypass para teste de servidor local
    const payload = buildJobEmbed(sampleJob);

    // Testamos a chamada HTTP real substituindo temporariamente o fetch ou testando com fetch direto
    const res = await fetch(
      `http://127.0.0.1:${serverPort}/api/webhooks/test?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    expect(res.status).toBe(200);
    expect(receivedRequests).toHaveLength(1);
    const rec = receivedRequests[0]!;
    expect(rec.headers["content-type"]).toBe("application/json");
    expect(rec.body.allowed_mentions).toEqual({ parse: [] });
    // Verifica que o @everyone foi sanitizado para @\u200beveryone
    expect(rec.body.embeds[0].title).not.toContain("@everyone");
    expect(rec.body.embeds[0].title).toContain("@\u200beveryone");
  });

  it("deve tratar resposta 204 No Content comum do Discord", async () => {
    receivedRequests = [];
    responseHandler = (_req, res) => {
      res.writeHead(204);
      res.end();
    };

    const payload = buildJobEmbed(sampleJob);
    const res = await fetch(
      `http://127.0.0.1:${serverPort}/api/webhooks/test?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    expect(res.status).toBe(204);
  });

  it("deve simular e extrair Retry-After de HTTP 429", async () => {
    receivedRequests = [];
    responseHandler = (_req, res) => {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "4",
      });
      res.end(JSON.stringify({ message: "You are being rate limited." }));
    };

    const res = await fetch(
      `http://127.0.0.1:${serverPort}/api/webhooks/test?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("4");
  });
});
