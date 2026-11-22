import { describe, it, expect } from "vitest";
import { SpamFilter } from "../../src/moderation/spam-filter.js";
import { blocklistManager } from "../../src/moderation/blocklist.js";
import type { NormalizedJob } from "../../src/domain/models.js";

describe("SpamFilter & Moderation", () => {
  const filter = new SpamFilter(30, 5, 50);

  const baseJob: NormalizedJob = {
    id: "job_mod_1",
    provider: "greenhouse",
    providerJobId: "mod1",
    company: "Good Company",
    title: "Software Engineer",
    description:
      "Valid description with plenty of details about the role and requirements.",
    location: "Remote",
    remoteType: "remote",
    seniority: "mid",
    technologies: ["TypeScript"],
    salaryMin: null,
    salaryMax: null,
    currency: null,
    country: null,
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://goodcompany.com/jobs/1",
    sourceUrl: "https://goodcompany.com/jobs/1",
    canonicalHash: "hashmod1",
    qualityScore: 75,
    inferredData: {},
    publishedAt: null,
    discoveredAt: "2026-03-01",
    lastSeenAt: "2026-03-01",
    status: "active",
  };

  it("deve aprovar vagas legítimas com dados completos", () => {
    const decision = filter.evaluateJob(baseJob);
    expect(decision.allowed).toBe(true);
  });

  it("deve rejeitar vagas de empresas na blocklist", () => {
    blocklistManager.addBlockedCompany("Fraudulent Inc");
    const blockedJob = { ...baseJob, company: "Fraudulent Inc" };
    const decision = filter.evaluateJob(blockedJob);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("blocklist");
  });

  it("deve rejeitar vagas com URL pertencente a domínio bloqueado", () => {
    blocklistManager.addBlockedDomain("malicious-jobs.com");
    const blockedJob = {
      ...baseJob,
      applyUrl: "https://malicious-jobs.com/apply",
    };
    const decision = filter.evaluateJob(blockedJob);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("bloqueado");
  });

  it("deve rejeitar vagas com URLs malformadas", () => {
    const brokenJob = { ...baseJob, applyUrl: "not-a-valid-url" };
    const decision = filter.evaluateJob(brokenJob);
    expect(decision.allowed).toBe(false);
  });

  it("deve rejeitar vagas com quality score abaixo do limite mínimo", () => {
    const lowQualityJob = { ...baseJob, qualityScore: 15 };
    const decision = filter.evaluateJob(lowQualityJob);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Score de qualidade insuficiente");
  });

  it("deve indicar se o limite diário foi atingido", () => {
    expect(filter.isDailyLimitExceeded(49)).toBe(false);
    expect(filter.isDailyLimitExceeded(50)).toBe(true);
    expect(filter.isDailyLimitExceeded(60)).toBe(true);
  });
});
