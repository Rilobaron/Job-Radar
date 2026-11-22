import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newDb } from "pg-mem";
import { PublisherService } from "../../src/services/publisher-service.js";
import { PublicationRepository } from "../../src/persistence/publication-repository.js";
import { JobRepository } from "../../src/persistence/job-repository.js";
import type { NormalizedJob } from "../../src/domain/models.js";

describe("DRY_RUN Non-Destructive Guarantee & Safety Lock", () => {
  let db: any;
  let poolInstance: any;
  let pubRepo: PublicationRepository;
  let jobRepo: JobRepository;
  let publisherService: PublisherService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    db = newDb();

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
    pubRepo = new PublicationRepository(poolInstance);
    jobRepo = new JobRepository(poolInstance);

    await pubRepo.syncChannels([
      {
        id: "channel_junior",
        name: "junior",
        category: "seniority",
        envKey: "DISCORD_WEBHOOK_JUNIOR",
        color: 123456,
        enabled: true,
      },
    ]);

    process.env.DISCORD_WEBHOOK_JUNIOR =
      "https://discord.com/api/webhooks/123/mock-token";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const sampleJob: NormalizedJob = {
    id: "dryrun_job_1",
    provider: "greenhouse",
    providerJobId: "dry_1",
    company: "DryRun Corp",
    title: "Junior Backend Engineer",
    description: "Node.js and TypeScript",
    location: "Remote, Brazil",
    remoteType: "remote",
    seniority: "junior",
    technologies: ["Node.js", "TypeScript"],
    salaryMin: 5000,
    salaryMax: 7000,
    currency: "BRL",
    country: "Brazil",
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://example.com/apply/1",
    sourceUrl: "https://example.com/jobs/1",
    canonicalHash: "hash_dry_1",
    qualityScore: 90,
    inferredData: {},
    publishedAt: "2026-03-01T10:00:00.000Z",
    discoveredAt: "2026-03-01T10:00:00.000Z",
    lastSeenAt: "2026-03-01T10:00:00.000Z",
    status: "active",
    isHistorical: false,
  };

  it("garante que DRY_RUN não altera status, não insere attempts e deixa a publicação em PENDING", async () => {
    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");

    // Instancia publisher em modo DRY_RUN
    publisherService = new PublisherService(pubRepo, true);

    const summary = await publisherService.runPublication();

    // Sumário deve reportar simulação bem-sucedida
    expect(summary.isDryRun).toBe(true);
    expect(summary.totalAttempted).toBe(1);
    expect(summary.totalSent).toBe(1);
    expect(summary.totalFailed).toBe(0);

    // VERIFICAÇÃO CRÍTICA DE PERSISTÊNCIA: O banco de dados deve estar INTACTO!
    const resPub = await poolInstance.query(
      "SELECT * FROM publications WHERE job_id = $1",
      [sampleJob.id],
    );
    expect(resPub.rows[0].status).toBe("PENDING"); // Não pode ser SENT nem SENDING!
    expect(resPub.rows[0].attempts_count).toBe(0); // Tentativas continuam zero!
    expect(resPub.rows[0].discord_message_id).toBeNull(); // Nenhum ID fictício gravado!
    expect(resPub.rows[0].published_at).toBeNull(); // Nenhuma data de publicação gravada!

    // Tabela publication_attempts deve estar completamente vazia
    const resAttempts = await poolInstance.query(
      "SELECT COUNT(*) as count FROM publication_attempts",
    );
    expect(parseInt(resAttempts.rows[0].count, 10)).toBe(0);

    // Contador de enviados hoje continua zero
    const countToday = await pubRepo.countSentTodayByChannel("channel_junior");
    expect(countToday).toBe(0);
  });

  it("garante que PUBLICATION_ENABLED=false bloqueia envios reais e força modo de segurança sem tocar no banco", async () => {
    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");

    process.env.PUBLICATION_ENABLED = "false";
    process.env.DRY_RUN = "false";

    // Criamos o publisher sem forçar isDryRun no construtor
    publisherService = new PublisherService(pubRepo, false);

    const summary = await publisherService.runPublication();

    // A trava de segurança deve ter interceptado e forçado isDryRun = true!
    expect(summary.isDryRun).toBe(true);
    expect(summary.totalAttempted).toBe(1);
    expect(summary.totalSent).toBe(1);

    // O status no banco permanece PENDING e sem attempts
    const resPub = await poolInstance.query(
      "SELECT * FROM publications WHERE job_id = $1",
      [sampleJob.id],
    );
    expect(resPub.rows[0].status).toBe("PENDING");

    const resAttempts = await poolInstance.query(
      "SELECT COUNT(*) as count FROM publication_attempts",
    );
    expect(parseInt(resAttempts.rows[0].count, 10)).toBe(0);
  });

  it("deve reprocessar publicações em RETRY cujo scheduled_at já passou", async () => {
    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");

    // Marca como RETRY agendado para o passado
    await poolInstance.query(
      `
      UPDATE publications
      SET status = 'RETRY', attempts_count = 1, scheduled_at = NOW() - interval '1 minute'
      WHERE job_id = $1;
    `,
      [sampleJob.id],
    );

    const peeks = await pubRepo.peekPendingPublications("channel_junior", 5);
    expect(peeks).toHaveLength(1);
    expect(peeks[0]?.publication.status).toBe("RETRY");
    expect(peeks[0]?.publication.attemptsCount).toBe(1);
  });

  it("deve recuperar publicações presas em SENDING após expiração do lease de 5 minutos", async () => {
    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");

    // Simula que um processo caiu há 6 minutos enquanto publicava
    await poolInstance.query(
      `
      UPDATE publications
      SET status = 'SENDING', scheduled_at = NOW() - interval '6 minutes'
      WHERE job_id = $1;
    `,
      [sampleJob.id],
    );

    const peeks = await pubRepo.peekPendingPublications("channel_junior", 5);
    expect(peeks).toHaveLength(1);
    expect(peeks[0]?.job.id).toBe(sampleJob.id);
  });

  it("não deve selecionar publicações já enviadas (status SENT)", async () => {
    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");

    await poolInstance.query(
      `
      UPDATE publications
      SET status = 'SENT', published_at = NOW()
      WHERE job_id = $1;
    `,
      [sampleJob.id],
    );

    const peeks = await pubRepo.peekPendingPublications("channel_junior", 5);
    expect(peeks).toHaveLength(0);
  });

  it("deve evitar mensagem duplicada no Discord quando múltiplos canais lógicos compartilham o mesmo webhook", async () => {
    process.env.PUBLICATION_ENABLED = "true";
    process.env.DRY_RUN = "false";
    const sharedWebhookUrl =
      "https://discord.com/api/webhooks/shared-id/shared-token";
    process.env.DISCORD_WEBHOOK_JUNIOR = sharedWebhookUrl;
    process.env.DISCORD_WEBHOOK_SENIOR = sharedWebhookUrl;

    await pubRepo.syncChannels([
      {
        id: "channel_junior",
        name: "junior",
        category: "seniority",
        envKey: "DISCORD_WEBHOOK_JUNIOR",
        color: 1,
      },
      {
        id: "channel_senior",
        name: "senior",
        category: "seniority",
        envKey: "DISCORD_WEBHOOK_SENIOR",
        color: 2,
      },
    ]);

    await jobRepo.upsertJob(sampleJob);
    await pubRepo.enqueuePublication(sampleJob.id, "channel_junior");
    await pubRepo.enqueuePublication(sampleJob.id, "channel_senior");

    let discordCallCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("discord.com")) {
        discordCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "shared_msg_123" }),
          json: async () => ({ id: "shared_msg_123" }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    try {
      const livePublisher = new PublisherService(pubRepo, false, 0);
      const summary = await livePublisher.runPublication();

      // O Discord deve ter recebido apenas UMA mensagem física
      expect(discordCallCount).toBe(1);
      expect(summary.totalSent).toBe(1);
      expect(summary.totalSkipped).toBe(1);

      // Ambas as publicações no banco devem constar como SENT
      const pubJunior = await poolInstance.query(
        "SELECT status, discord_message_id FROM publications WHERE channel_id = 'channel_junior'",
      );
      const pubSenior = await poolInstance.query(
        "SELECT status, discord_message_id FROM publications WHERE channel_id = 'channel_senior'",
      );

      expect(pubJunior.rows[0].status).toBe("SENT");
      expect(pubSenior.rows[0].status).toBe("SENT");
      expect(
        pubJunior.rows[0].discord_message_id === "shared_msg_123" ||
          pubSenior.rows[0].discord_message_id === "shared_msg_123",
      ).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
