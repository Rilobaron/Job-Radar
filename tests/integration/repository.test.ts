import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { JobRepository } from "../../src/persistence/job-repository.js";
import { PublicationRepository } from "../../src/persistence/publication-repository.js";
import type { NormalizedJob } from "../../src/domain/models.js";

describe("Repository & Persistence (pg-mem Integration)", () => {
  let db: any;
  let poolAdapter: any;
  let jobRepo: JobRepository;
  let pubRepo: PublicationRepository;

  beforeEach(() => {
    db = newDb();

    // Cria as tabelas essenciais no banco em memória
    db.public.none(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(150) PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        provider_job_id VARCHAR(255) NOT NULL,
        company VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        location VARCHAR(500),
        remote_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
        seniority VARCHAR(20) NOT NULL DEFAULT 'unknown',
        salary_min NUMERIC(12, 2),
        salary_max NUMERIC(12, 2),
        currency VARCHAR(10),
        country VARCHAR(100),
        eligible_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
        employment_type VARCHAR(100),
        apply_url VARCHAR(1000) NOT NULL,
        source_url VARCHAR(1000) NOT NULL,
        canonical_hash VARCHAR(64) NOT NULL,
        quality_score INTEGER NOT NULL DEFAULT 0,
        inferred_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        is_historical BOOLEAN NOT NULL DEFAULT false,
        published_at TIMESTAMPTZ,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_jobs_provider_job_id UNIQUE (provider, provider_job_id)
      );

      CREATE TABLE IF NOT EXISTS job_tags (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(150) NOT NULL,
        tag_type VARCHAR(50) NOT NULL,
        tag_name VARCHAR(100) NOT NULL,
        confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_job_tags_job_type_name UNIQUE (job_id, tag_type, tag_name)
      );

      CREATE TABLE IF NOT EXISTS discord_channels (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        category VARCHAR(50) NOT NULL,
        description VARCHAR(255),
        env_key VARCHAR(100) NOT NULL,
        color INTEGER NOT NULL DEFAULT 5814783,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS publications (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(150) NOT NULL,
        channel_id VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempts_count INTEGER NOT NULL DEFAULT 0,
        discord_message_id VARCHAR(100),
        last_error TEXT,
        scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_publications_job_channel UNIQUE (job_id, channel_id)
      );
    `);

    // Cria pool pg-mem compatível
    poolAdapter = db.adapters.createPg().Pool;
    const poolInstance = new poolAdapter();

    jobRepo = new JobRepository(poolInstance);
    pubRepo = new PublicationRepository(poolInstance);
  });

  const testJob: NormalizedJob = {
    id: "greenhouse_12345",
    provider: "greenhouse",
    providerJobId: "12345",
    company: "GitLab",
    title: "Senior Go Engineer",
    description: "Write Go services",
    location: "Remote, Brazil",
    remoteType: "remote",
    seniority: "senior",
    technologies: ["Go", "Docker"],
    salaryMin: 10000,
    salaryMax: 15000,
    currency: "USD",
    country: "Brazil",
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://gitlab.com/apply/12345",
    sourceUrl: "https://gitlab.com/jobs/12345",
    canonicalHash: "can_hash_gitlab_go",
    qualityScore: 90,
    inferredData: {},
    publishedAt: "2026-03-01T10:00:00.000Z",
    discoveredAt: "2026-03-01T10:00:00.000Z",
    lastSeenAt: "2026-03-01T10:00:00.000Z",
    status: "active",
    isHistorical: false,
  };

  it("deve inserir nova vaga e retornar isNew: true", async () => {
    const { isNew } = await jobRepo.upsertJob(testJob);
    expect(isNew).toBe(true);

    const count = await jobRepo.countTotal();
    expect(count).toBe(1);

    const found = await jobRepo.findById("greenhouse_12345");
    expect(found).toBeDefined();
    expect(found?.title).toBe("Senior Go Engineer");
  });

  it("deve executar UPSERT idempotente sem duplicar registros", async () => {
    // Primeira inserção
    const first = await jobRepo.upsertJob(testJob);
    expect(first.isNew).toBe(true);

    // Segunda inserção com título atualizado
    const updatedJob = {
      ...testJob,
      title: "Senior Go Engineer - Cloud Platform",
    };
    const second = await jobRepo.upsertJob(updatedJob);
    expect(second.isNew).toBe(false);

    // Total de registros deve continuar sendo 1
    const count = await jobRepo.countTotal();
    expect(count).toBe(1);

    const found = await jobRepo.findById("greenhouse_12345");
    expect(found?.title).toBe("Senior Go Engineer - Cloud Platform");
  });

  it("deve sincronizar canais e enfileirar publicações sem duplicações", async () => {
    await pubRepo.syncChannels([
      {
        id: "channel_senior",
        name: "senior",
        category: "seniority",
        envKey: "DISCORD_WEBHOOK_SENIOR",
        color: 15158332,
      },
    ]);

    // Insere a vaga
    await jobRepo.upsertJob(testJob);

    // Enfileira pela primeira vez
    const enqueued1 = await pubRepo.enqueuePublication(
      testJob.id,
      "channel_senior",
    );
    expect(enqueued1).toBe(true);

    // Tentar enfileirar novamente para o mesmo canal não deve duplicar
    const enqueued2 = await pubRepo.enqueuePublication(
      testJob.id,
      "channel_senior",
    );
    expect(enqueued2).toBe(false);

    // Consulta e adquire pendentes atomicamente com lease
    const pendings = await pubRepo.getPendingPublications("channel_senior", 10);
    expect(pendings).toHaveLength(1);
    expect(pendings[0]?.publication.status).toBe("SENDING");

    // Atualiza status para SENT
    await pubRepo.updatePublicationStatus(
      pendings[0]!.publication.id!,
      "SENT",
      {
        discordMessageId: "msg_discord_999",
      },
    );

    // Agora pendentes deve ser zero
    const pendingsAfter = await pubRepo.getPendingPublications(
      "channel_senior",
      10,
    );
    expect(pendingsAfter).toHaveLength(0);
  });
});
