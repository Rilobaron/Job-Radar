import { describe, it, expect } from "vitest";
import {
  buildJobEmbed,
  sanitizeDiscordText,
  truncateText,
  formatSeniorityLabel,
  formatRemoteLabel,
} from "../../src/publisher/embed.js";
import type { NormalizedJob } from "../../src/domain/models.js";

describe("Discord Embed Builder", () => {
  const sampleJob: NormalizedJob = {
    id: "test_job_1",
    provider: "greenhouse",
    providerJobId: "123",
    company: "Acme Corp",
    title: "Senior Fullstack Developer",
    description: "Sample description",
    location: "São Paulo, Brazil",
    remoteType: "remote",
    seniority: "senior",
    technologies: ["TypeScript", "React", "Node.js"],
    salaryMin: 15000,
    salaryMax: 20000,
    currency: "BRL",
    country: "Brazil",
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://acme.com/apply/123",
    sourceUrl: "https://acme.com/jobs/123",
    canonicalHash: "hash123",
    qualityScore: 95,
    inferredData: {},
    publishedAt: "2026-03-01T10:00:00.000Z",
    discoveredAt: "2026-03-01T10:00:00.000Z",
    lastSeenAt: "2026-03-01T10:00:00.000Z",
    status: "active",
  };

  it("deve gerar payload de webhook válido com embed preenchido", () => {
    const payload = buildJobEmbed(sampleJob);
    expect(payload.embeds).toHaveLength(1);
    const embed = payload.embeds[0]!;

    expect(embed.title).toContain("Senior Fullstack Developer @ Acme Corp");
    expect(embed.url).toBe(sampleJob.applyUrl);
    expect(embed.fields).toBeDefined();

    // Verifica campos essenciais
    const fieldNames = embed.fields!.map((f) => f.name);
    expect(fieldNames).toContain("🏢 Empresa");
    expect(fieldNames).toContain("💼 Nível");
    expect(fieldNames).toContain("🌍 Modalidade");
    expect(fieldNames).toContain("📍 Localização");
    expect(fieldNames).toContain("💰 Remuneração");
    expect(fieldNames).toContain("🛠️ Tecnologias");
    expect(fieldNames).toContain("🚀 Candidatura Oficial");
  });

  it("deve desabilitar todas as menções automáticas por segurança", () => {
    const payload = buildJobEmbed(sampleJob);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it("deve sanitizar injeções de @everyone e @here", () => {
    const dirty = "Confira a vaga @everyone e @here agora!";
    const sanitized = sanitizeDiscordText(dirty);
    expect(sanitized).not.toContain("@everyone");
    expect(sanitized).not.toContain("@here");
  });

  it("deve truncar títulos que excedam o limite de 256 caracteres", () => {
    const hugeTitle = "A".repeat(300);
    const truncated = truncateText(hugeTitle, 256);
    expect(truncated.length).toBe(256);
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("deve formatar labels em português amigável", () => {
    expect(formatSeniorityLabel("intern")).toBe("Estágio / Trainee");
    expect(formatSeniorityLabel("junior")).toBe("Júnior");
    expect(formatSeniorityLabel("mid")).toBe("Pleno");
    expect(formatSeniorityLabel("senior")).toBe("Sênior");
    expect(formatRemoteLabel("remote")).toContain("100% Remoto");
    expect(formatRemoteLabel("hybrid")).toContain("Híbrido");
  });
});
