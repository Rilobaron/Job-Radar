import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { newDb } from "pg-mem";
import { CollectorService } from "../../src/services/collector-service.js";
import { PublisherService } from "../../src/services/publisher-service.js";
import { JobRepository } from "../../src/persistence/job-repository.js";
import { SourceRepository } from "../../src/persistence/source-repository.js";
import { RunRepository } from "../../src/persistence/run-repository.js";
import { PublicationRepository } from "../../src/persistence/publication-repository.js";
import { SpamFilter } from "../../src/moderation/spam-filter.js";

describe("E2E Full Pipeline Simulation", () => {
  const originalFetch = global.fetch;
  let db: any;
  let poolInstance: any;
  let jobRepo: JobRepository;
  let sourceRepo: SourceRepository;
  let runRepo: RunRepository;
  let pubRepo: PublicationRepository;
  let collectorService: CollectorService;
  let publisherService: PublisherService;

  beforeEach(async () => {
    db = newDb();

    // Schemas
    db.public.none(`
      CREATE TABLE IF NOT EXISTS sources (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        identifier VARCHAR(150) NOT NULL,
        base_url VARCHAR(500) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sources_provider_identifier UNIQUE (provider, identifier)
      );

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

      CREATE TABLE IF NOT EXISTS collection_runs (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        source_identifier VARCHAR(150) NOT NULL,
        status VARCHAR(20) NOT NULL,
        duration_ms INTEGER NOT NULL,
        total_received INTEGER NOT NULL DEFAULT 0,
        total_new INTEGER NOT NULL DEFAULT 0,
        total_duplicates INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS publication_attempts (
        id SERIAL PRIMARY KEY,
        publication_id BIGINT NOT NULL,
        attempt_number INTEGER NOT NULL,
        status_code INTEGER,
        response_body TEXT,
        error_message TEXT,
        duration_ms INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    poolInstance = new (db.adapters.createPg().Pool)();

    jobRepo = new JobRepository(poolInstance);
    sourceRepo = new SourceRepository(poolInstance);
    runRepo = new RunRepository(poolInstance);
    pubRepo = new PublicationRepository(poolInstance);

    // Preenche canais e fontes
    await pubRepo.syncChannels([
      {
        id: "channel_senior",
        name: "senior",
        category: "seniority",
        envKey: "DISCORD_WEBHOOK_SENIOR",
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
        id: "channel_international",
        name: "internacional",
        category: "region",
        envKey: "DISCORD_WEBHOOK_INTERNATIONAL",
        color: 3,
      },
      {
        id: "channel_usd",
        name: "vagas-em-dolar",
        category: "compensation",
        envKey: "DISCORD_WEBHOOK_USD",
        color: 4,
      },
    ]);

    await sourceRepo.upsert({
      id: "src_greenhouse_gitlab",
      name: "GitLab",
      provider: "greenhouse",
      identifier: "gitlab",
      baseUrl:
        "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true",
      enabled: true,
    });

    process.env.PUBLICATION_ENABLED = "true";
    process.env.DISCORD_WEBHOOK_SENIOR =
      "https://discord.com/api/webhooks/mock/senior";
    process.env.DISCORD_WEBHOOK_JUNIOR =
      "https://discord.com/api/webhooks/mock/junior";
    process.env.DISCORD_WEBHOOK_INTERNATIONAL =
      "https://discord.com/api/webhooks/mock/intl";
    process.env.DISCORD_WEBHOOK_USD =
      "https://discord.com/api/webhooks/mock/usd";

    collectorService = new CollectorService(
      jobRepo,
      sourceRepo,
      runRepo,
      pubRepo,
      new SpamFilter(20),
    );

    publisherService = new PublisherService(pubRepo, false, 0); // Modo de publicação ativa com Discord mockado (sem delay de intervalo)
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.PUBLICATION_ENABLED;
    delete process.env.DISCORD_WEBHOOK_SENIOR;
    delete process.env.DISCORD_WEBHOOK_JUNIOR;
    delete process.env.DISCORD_WEBHOOK_INTERNATIONAL;
    delete process.env.DISCORD_WEBHOOK_USD;
  });

  it("deve executar o fluxo completo e garantir idempotência sem duplicações indevidas", async () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../fixtures/greenhouse-sample.json"),
        "utf-8",
      ),
    );

    // Mock do fetch externo do Greenhouse e do Discord
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("greenhouse.io")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(fixture),
        });
      }
      if (url.includes("discord.com")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "disc_msg_123" }),
          json: async () => ({ id: "disc_msg_123" }),
        });
      }
      return Promise.reject(new Error("Unknown URL: " + url));
    });

    // 1º Ciclo de Coleta (Novo lote)
    const run1 = await collectorService.runCollection();
    expect(run1.totalCollected).toBe(2);
    expect(run1.totalNew).toBe(2);
    expect(run1.totalDuplicates).toBe(0);
    expect(run1.totalEnqueued).toBeGreaterThan(0);

    // Vagas persistidas no banco
    const totalJobs1 = await jobRepo.countTotal();
    expect(totalJobs1).toBe(2);

    // 1º Ciclo de Publicação (DRY-RUN)
    const pubRun1 = await publisherService.runPublication();
    expect(pubRun1.totalSent).toBe(run1.totalEnqueued);
    expect(pubRun1.totalFailed).toBe(0);

    // 2º Ciclo de Coleta com os mesmos dados (Deverá ser 100% deduplicado!)
    const run2 = await collectorService.runCollection();
    expect(run2.totalCollected).toBe(2);
    expect(run2.totalNew).toBe(0); // Zero vagas novas!
    expect(run2.totalDuplicates).toBe(2); // Ambas identificadas como duplicatas!
    expect(run2.totalEnqueued).toBe(0); // Nenhuma nova publicação enfileirada!

    // O total no banco de dados continua sendo 2
    const totalJobs2 = await jobRepo.countTotal();
    expect(totalJobs2).toBe(2);

    // 2º Ciclo de Publicação: nada deve ser publicado novamente
    const pubRun2 = await publisherService.runPublication();
    expect(pubRun2.totalAttempted).toBe(0);
    expect(pubRun2.totalSent).toBe(0);
  });
});
