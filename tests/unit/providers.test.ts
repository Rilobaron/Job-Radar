import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GreenhouseProvider } from "../../src/providers/greenhouse.js";
import { LeverProvider } from "../../src/providers/lever.js";
import { AshbyProvider } from "../../src/providers/ashby.js";
import { providerRegistry } from "../../src/providers/registry.js";
import { ProviderError } from "../../src/domain/errors.js";

describe("Job Providers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("GreenhouseProvider", () => {
    const provider = new GreenhouseProvider();
    const mockFixture = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../fixtures/greenhouse-sample.json"),
        "utf-8",
      ),
    );

    it("deve coletar e normalizar vagas do Greenhouse com sucesso", () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockFixture),
      } as any);

      return provider
        .collect({
          id: "src_gitlab",
          name: "GitLab",
          provider: "greenhouse",
          identifier: "gitlab",
          baseUrl: "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs",
          enabled: true,
        })
        .then((jobs) => {
          expect(jobs).toHaveLength(2);
          expect(jobs[0]?.title).toBe(
            "Senior Frontend Engineer (React/TypeScript)",
          );
          expect(jobs[0]?.seniority).toBe("senior");
          expect(jobs[0]?.technologies).toContain("React");
          expect(jobs[0]?.technologies).toContain("TypeScript");
          expect(jobs[0]?.technologies).toContain("PostgreSQL");
          expect(jobs[0]?.inferredData.usdEvidence).toBeDefined();

          expect(jobs[1]?.title).toBe("Desenvolvedor Júnior");
          expect(jobs[1]?.seniority).toBe("junior");
          expect(jobs[1]?.remoteType).toBe("remote");
          expect(jobs[1]?.country).toBe("Brazil");
        });
    });

    it("deve lançar ProviderError se o schema for inválido", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ invalidField: 123 }),
      } as any);

      await expect(
        provider.collect({
          id: "src_invalid",
          name: "Invalid",
          provider: "greenhouse",
          identifier: "invalid",
          baseUrl: "https://boards-api.greenhouse.io/v1/boards/invalid/jobs",
          enabled: true,
        }),
      ).rejects.toThrow(ProviderError);
    });

    it("deve lançar NetworkError quando a API falhar repetidamente com 500", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as any);

      await expect(
        provider.collect({
          id: "src_error",
          name: "Error",
          provider: "greenhouse",
          identifier: "error",
          baseUrl: "https://boards-api.greenhouse.io/v1/boards/error/jobs",
          enabled: true,
        }),
      ).rejects.toThrow();
    });

    it("deve retornar vazio se a fonte estiver desabilitada", async () => {
      const jobs = await provider.collect({
        id: "src_disabled",
        name: "Disabled",
        provider: "greenhouse",
        identifier: "disabled",
        baseUrl: "https://boards-api.greenhouse.io/v1/boards/disabled/jobs",
        enabled: false,
      });
      expect(jobs).toHaveLength(0);
    });
  });

  describe("LeverProvider", () => {
    const provider = new LeverProvider();
    const mockFixture = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../fixtures/lever-sample.json"),
        "utf-8",
      ),
    );

    it("deve coletar e normalizar vagas do Lever com sucesso", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockFixture),
      } as any);

      const jobs = await provider.collect({
        id: "src_palantir",
        name: "Palantir",
        provider: "lever",
        identifier: "palantir",
        baseUrl: "https://api.lever.co/v0/postings/palantir?mode=json",
        enabled: true,
      });

      expect(jobs).toHaveLength(2);
      expect(jobs[0]?.title).toBe("Fullstack Software Engineer - Pleno");
      expect(jobs[0]?.seniority).toBe("mid");
      expect(jobs[0]?.remoteType).toBe("hybrid");
      expect(jobs[0]?.technologies).toContain("Go");
      expect(jobs[0]?.technologies).toContain("Python");
      expect(jobs[0]?.technologies).toContain("Kubernetes");

      expect(jobs[1]?.title).toBe("Programa de Estágio Tech 2026");
      expect(jobs[1]?.seniority).toBe("intern");
      expect(jobs[1]?.remoteType).toBe("remote");
    });
  });

  describe("AshbyProvider", () => {
    const provider = new AshbyProvider();
    const mockFixture = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../fixtures/ashby-sample.json"),
        "utf-8",
      ),
    );

    it("deve coletar e normalizar vagas do Ashby com remuneração e USD", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockFixture),
      } as any);

      const jobs = await provider.collect({
        id: "src_linear",
        name: "Linear",
        provider: "ashby",
        identifier: "linear",
        baseUrl: "https://api.ashbyhq.com/posting-api/job-board/linear",
        enabled: true,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.title).toBe("Staff Backend Engineer");
      expect(jobs[0]?.seniority).toBe("staff");
      expect(jobs[0]?.salaryMin).toBe(180000);
      expect(jobs[0]?.salaryMax).toBe(220000);
      expect(jobs[0]?.currency).toBe("USD");
      expect(jobs[0]?.remoteType).toBe("remote");
      expect(jobs[0]?.inferredData.usdEvidence).toBeDefined();
    });
  });

  describe("ProviderRegistry", () => {
    it("deve registrar e recuperar provedores corretamente", () => {
      expect(providerRegistry.get("greenhouse")).toBeDefined();
      expect(providerRegistry.get("lever")).toBeDefined();
      expect(providerRegistry.get("ashby")).toBeDefined();
      expect(providerRegistry.get("nonexistent")).toBeUndefined();
    });
  });
});
