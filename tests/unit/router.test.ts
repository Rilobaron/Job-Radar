import { describe, it, expect } from "vitest";
import { JobRouter } from "../../src/publisher/router.js";
import type {
  NormalizedJob,
  DiscordChannelConfig,
} from "../../src/domain/models.js";

describe("JobRouter", () => {
  const mockChannels: DiscordChannelConfig[] = [
    {
      id: "channel_intern",
      name: "estagio-trainee",
      category: "seniority",
      envKey: "DISCORD_WEBHOOK_INTERN",
      color: 1,
    },
    {
      id: "channel_junior",
      name: "junior",
      category: "seniority",
      envKey: "DISCORD_WEBHOOK_JUNIOR",
      color: 2,
    },
    {
      id: "channel_mid",
      name: "pleno",
      category: "seniority",
      envKey: "DISCORD_WEBHOOK_MID",
      color: 3,
    },
    {
      id: "channel_senior",
      name: "senior",
      category: "seniority",
      envKey: "DISCORD_WEBHOOK_SENIOR",
      color: 4,
    },
    {
      id: "channel_brazil_remote",
      name: "brasil-remoto",
      category: "region",
      envKey: "DISCORD_WEBHOOK_BRAZIL_REMOTE",
      color: 5,
    },
    {
      id: "channel_international",
      name: "internacional",
      category: "region",
      envKey: "DISCORD_WEBHOOK_INTERNATIONAL",
      color: 6,
    },
    {
      id: "channel_usd",
      name: "vagas-em-dolar",
      category: "compensation",
      envKey: "DISCORD_WEBHOOK_USD",
      color: 7,
    },
  ];

  const router = new JobRouter(mockChannels);

  it("deve rotear vaga júnior no Brasil remoto para canal_junior e channel_brazil_remote", () => {
    const job: NormalizedJob = {
      id: "j1",
      provider: "greenhouse",
      providerJobId: "1",
      company: "Tech BR",
      title: "Junior Dev",
      description: "Node.js",
      location: "São Paulo, Brazil",
      remoteType: "remote",
      seniority: "junior",
      technologies: ["Node.js"],
      salaryMin: null,
      salaryMax: null,
      currency: "BRL",
      country: "Brazil",
      eligibleRegions: ["Brazil"],
      employmentType: "Full-time",
      applyUrl: "https://example.com/apply",
      sourceUrl: "https://example.com",
      canonicalHash: "hash1",
      qualityScore: 90,
      inferredData: {},
      publishedAt: null,
      discoveredAt: "2026-03-01",
      lastSeenAt: "2026-03-01",
      status: "active",
    };

    const routes = router.routeJob(job);
    const ids = routes.map((r) => r.id);

    expect(ids).toContain("channel_junior");
    expect(ids).toContain("channel_brazil_remote");
    expect(ids).not.toContain("channel_senior");
    expect(ids).not.toContain("channel_usd");
  });

  it("deve rotear vaga com remuneração em USD para channel_usd", () => {
    const job: NormalizedJob = {
      id: "j2",
      provider: "ashby",
      providerJobId: "2",
      company: "US Tech",
      title: "Senior Go Engineer",
      description: "Pay: $140,000 USD",
      location: "Remote, Global",
      remoteType: "remote",
      seniority: "senior",
      technologies: ["Go"],
      salaryMin: 140000,
      salaryMax: 160000,
      currency: "USD",
      country: null,
      eligibleRegions: ["International"],
      employmentType: "Full-time",
      applyUrl: "https://example.com/apply",
      sourceUrl: "https://example.com",
      canonicalHash: "hash2",
      qualityScore: 95,
      inferredData: { usdEvidence: "USD" },
      publishedAt: null,
      discoveredAt: "2026-03-01",
      lastSeenAt: "2026-03-01",
      status: "active",
    };

    const routes = router.routeJob(job);
    const ids = routes.map((r) => r.id);

    expect(ids).toContain("channel_senior");
    expect(ids).toContain("channel_international");
    expect(ids).toContain("channel_usd");
  });

  it("não deve rotear para channel_usd se não houver evidência explícita", () => {
    const job: NormalizedJob = {
      id: "j3",
      provider: "lever",
      providerJobId: "3",
      company: "Foreign Company",
      title: "Senior Engineer",
      description: "Great opportunity abroad",
      location: "Remote",
      remoteType: "remote",
      seniority: "senior",
      technologies: [],
      salaryMin: null,
      salaryMax: null,
      currency: null,
      country: null,
      eligibleRegions: ["International"],
      employmentType: "Full-time",
      applyUrl: "https://example.com/apply",
      sourceUrl: "https://example.com",
      canonicalHash: "hash3",
      qualityScore: 70,
      inferredData: {},
      publishedAt: null,
      discoveredAt: "2026-03-01",
      lastSeenAt: "2026-03-01",
      status: "active",
    };

    const routes = router.routeJob(job);
    const ids = routes.map((r) => r.id);

    expect(ids).not.toContain("channel_usd");
  });
});
