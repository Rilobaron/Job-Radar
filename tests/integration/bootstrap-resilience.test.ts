import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newDb } from "pg-mem";
import { BootstrapService } from "../../src/services/bootstrap-service.js";
import { CollectorService } from "../../src/services/collector-service.js";
import { JobRepository } from "../../src/persistence/job-repository.js";
import { SourceRepository } from "../../src/persistence/source-repository.js";
import { RunRepository } from "../../src/persistence/run-repository.js";
import { PublicationRepository } from "../../src/persistence/publication-repository.js";
import { SpamFilter } from "../../src/moderation/spam-filter.js";

describe("Bootstrap Safety & Idempotence Verification", () => {
  const originalFetch = global.fetch;
  let db: any;
  let poolInstance: any;
  let jobRepo: JobRepository;
  let sourceRepo: SourceRepository;
  let runRepo: RunRepository;
  let pubRepo: PublicationRepository;
  let collectorService: CollectorService;
  let _bootstrapService: BootstrapService;

  beforeEach(async () => {
    db = newDb();

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
    `);

    poolInstance = new (db.adapters.createPg().Pool)();

    jobRepo = new JobRepository(poolInstance);
    sourceRepo = new SourceRepository(poolInstance);
    runRepo = new RunRepository(poolInstance);
    pubRepo = new PublicationRepository(poolInstance);

    await sourceRepo.upsert({
      id: "src_greenhouse_test",
      name: "Acme Bootstrap",
      provider: "greenhouse",
      identifier: "acme",
      baseUrl:
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
      enabled: true,
    });

    collectorService = new CollectorService(
      jobRepo,
      sourceRepo,
      runRepo,
      pubRepo,
      new SpamFilter(20),
    );

    _bootstrapService = new BootstrapService(collectorService, pubRepo);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("deve catalogar 100% das vagas iniciais como históricas com zero notificações", async () => {
    const fakeJobs = {
      jobs: [
        {
          id: 1,
          title: "Senior Engineer",
          absolute_url: "https://example.com/1",
          location: { name: "Remote" },
          content: "<p>TypeScript and Node.js</p>",
        },
        {
          id: 2,
          title: "Junior Developer",
          absolute_url: "https://example.com/2",
          location: { name: "Remote" },
          content: "<p>React and Docker</p>",
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(fakeJobs),
    } as any);

    // Executa bootstrap
    const summary = await collectorService.runCollection({
      markAsHistorical: true,
    });

    expect(summary.totalCollected).toBe(2);
    expect(summary.totalNew).toBe(2);
    expect(summary.totalEnqueued).toBe(0); // ZERO publicações enfileiradas!

    // Verifica que todas foram marcadas como is_historical = true
    const job1 = await jobRepo.findById("greenhouse_1");
    const job2 = await jobRepo.findById("greenhouse_2");
    expect(job1?.isHistorical).toBe(true);
    expect(job2?.isHistorical).toBe(true);

    // Executa bootstrap uma segunda vez (deve ser 100% idempotente)
    const summary2 = await collectorService.runCollection({
      markAsHistorical: true,
    });
    expect(summary2.totalCollected).toBe(2);
    expect(summary2.totalNew).toBe(0);
    expect(summary2.totalDuplicates).toBe(2);
    expect(summary2.totalEnqueued).toBe(0);
  });
});
