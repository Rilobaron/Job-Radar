import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { JobRepository } from "../../src/persistence/job-repository.js";
import { PublicationRepository } from "../../src/persistence/publication-repository.js";
import { SourceRepository } from "../../src/persistence/source-repository.js";
import { runMigrations } from "../../migrations/runner.js";
import type { NormalizedJob } from "../../src/domain/models.js";

const { Pool } = pg;

const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

describe("PostgreSQL Real Integration & Concurrency", () => {
  let pool: pg.Pool | null = null;
  let jobRepo: JobRepository;
  let _pubRepo: PublicationRepository;
  let _sourceRepo: SourceRepository;
  let isRealDbAvailable = false;

  beforeAll(async () => {
    if (!testDbUrl) {
      console.log(
        "\nℹ️  [POSTGRES-REAL] Nenhuma TEST_DATABASE_URL ou DATABASE_URL configurada no ambiente. Testes de PostgreSQL real serão pulados.",
      );
      return;
    }

    try {
      pool = new Pool({
        connectionString: testDbUrl,
        connectionTimeoutMillis: 3000,
      });

      const client = await pool.connect();
      await client.query("SELECT 1;");
      client.release();
      isRealDbAvailable = true;

      // Executa migrações
      await runMigrations();

      jobRepo = new JobRepository(pool);
      _pubRepo = new PublicationRepository(pool);
      _sourceRepo = new SourceRepository(pool);
    } catch (err) {
      console.log(
        `\n⚠️  [POSTGRES-REAL] Não foi possível conectar ao banco em ${testDbUrl}: ${(err as Error).message}. Testes com PostgreSQL real serão pulados.`,
      );
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
      isRealDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  const testRealJob: NormalizedJob = {
    id: "real_pg_test_1",
    provider: "greenhouse",
    providerJobId: "pg_job_1",
    company: "Real Postgres Co",
    title: "Senior Staff Database Architect",
    description:
      "PostgreSQL internals, indexing, partitioning and query tuning.",
    location: "São Paulo, Brazil",
    remoteType: "remote",
    seniority: "staff",
    technologies: ["PostgreSQL", "Docker", "Go"],
    salaryMin: 25000,
    salaryMax: 35000,
    currency: "BRL",
    country: "Brazil",
    eligibleRegions: ["Brazil"],
    employmentType: "Full-time",
    applyUrl: "https://realpostgres.com/jobs/1",
    sourceUrl: "https://realpostgres.com/jobs/1",
    canonicalHash: "can_hash_real_pg_1",
    qualityScore: 98,
    inferredData: { seniorityEvidence: "Senior Staff in title" },
    publishedAt: "2026-03-01T12:00:00.000Z",
    discoveredAt: "2026-03-01T12:00:00.000Z",
    lastSeenAt: "2026-03-01T12:00:00.000Z",
    status: "active",
    isHistorical: false,
  };

  it("deve inserir e atualizar a mesma vaga com UPSERT idempotente em PostgreSQL real", async () => {
    if (!isRealDbAvailable || !pool) {
      console.log("Pulo: PostgreSQL real indisponível.");
      return;
    }

    // 1. Inserção inicial
    const insertRes = await jobRepo.upsertJob(testRealJob);
    expect(insertRes.isNew).toBe(true);

    const found = await jobRepo.findById(testRealJob.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe(testRealJob.title);

    // 2. Atualização idempotente
    const updated = {
      ...testRealJob,
      title: "Senior Staff Database Architect (Cloud)",
    };
    const updateRes = await jobRepo.upsertJob(updated);
    expect(updateRes.isNew).toBe(false);

    const foundAfter = await jobRepo.findById(testRealJob.id);
    expect(foundAfter?.title).toBe("Senior Staff Database Architect (Cloud)");
  });

  it("deve garantir integridade e deduplicação em inserções concorrentes", async () => {
    if (!isRealDbAvailable || !pool) {
      return;
    }

    // Dispara 5 inserções simultâneas da mesma vaga
    const concurrentPromises = Array.from({ length: 5 }).map((_, i) =>
      jobRepo.upsertJob({
        ...testRealJob,
        id: "real_pg_concurrent_job",
        providerJobId: "concurrent_123",
        title: `Concurrent Job Attempt ${i + 1}`,
      }),
    );

    const results = await Promise.all(concurrentPromises);
    const newCount = results.filter((r) => r.isNew).length;

    // Apenas 1 deve ser marcada como isNew
    expect(newCount).toBe(1);
  });

  it("deve executar rollback atômico em caso de falha de transação", async () => {
    if (!isRealDbAvailable || !pool) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO sources (id, name, provider, identifier, base_url) VALUES ($1, $2, $3, $4, $5)",
        [
          "src_rollback_test",
          "Rollback Co",
          "greenhouse",
          "rollback_co",
          "http://example.com",
        ],
      );
      // Força um erro de constraint
      await client.query(
        "INSERT INTO sources (id, name, provider, identifier, base_url) VALUES ($1, $2, $3, $4, $5)",
        [
          "src_rollback_test", // chave primária duplicada
          "Rollback Co 2",
          "greenhouse",
          "rollback_co_2",
          "http://example.com",
        ],
      );
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    // Verifica que a fonte foi revertida e não existe no banco
    const res = await pool.query(
      "SELECT * FROM sources WHERE id = 'src_rollback_test'",
    );
    expect(res.rowCount).toBe(0);
  });
});
