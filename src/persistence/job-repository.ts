import type pg from "pg";
import { getPool } from "./db.js";
import type { NormalizedJob } from "../domain/models.js";
import { DatabaseError } from "../domain/errors.js";

export class JobRepository {
  constructor(private pool: pg.Pool = getPool()) {}

  async upsertJob(
    job: NormalizedJob,
    client?: pg.PoolClient,
  ): Promise<{ isNew: boolean; job: NormalizedJob }> {
    const executor = client ?? this.pool;

    try {
      const existsRes = await executor.query(
        "SELECT 1 FROM jobs WHERE provider = $1 AND provider_job_id = $2 LIMIT 1",
        [job.provider, job.providerJobId],
      );
      const isNew = (existsRes.rowCount ?? 0) === 0;

      const query = `
        INSERT INTO jobs (
          id, provider, provider_job_id, company, title, description, location,
          remote_type, seniority, salary_min, salary_max, currency, country,
          eligible_regions, employment_type, apply_url, source_url, canonical_hash,
          quality_score, inferred_data, status, is_historical, published_at,
          discovered_at, last_seen_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23,
          $24, $25, NOW()
        )
        ON CONFLICT (provider, provider_job_id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          remote_type = EXCLUDED.remote_type,
          seniority = EXCLUDED.seniority,
          salary_min = EXCLUDED.salary_min,
          salary_max = EXCLUDED.salary_max,
          currency = EXCLUDED.currency,
          country = EXCLUDED.country,
          eligible_regions = EXCLUDED.eligible_regions,
          employment_type = EXCLUDED.employment_type,
          apply_url = EXCLUDED.apply_url,
          canonical_hash = EXCLUDED.canonical_hash,
          quality_score = EXCLUDED.quality_score,
          inferred_data = EXCLUDED.inferred_data,
          last_seen_at = NOW(),
          updated_at = NOW()
        RETURNING id;
      `;

      const values = [
        job.id,
        job.provider,
        job.providerJobId,
        job.company,
        job.title,
        job.description,
        job.location,
        job.remoteType,
        job.seniority,
        job.salaryMin,
        job.salaryMax,
        job.currency,
        job.country,
        JSON.stringify(job.eligibleRegions),
        job.employmentType,
        job.applyUrl,
        job.sourceUrl,
        job.canonicalHash,
        job.qualityScore,
        JSON.stringify(job.inferredData),
        job.status,
        job.isHistorical ?? false,
        job.publishedAt ? new Date(job.publishedAt) : null,
        new Date(job.discoveredAt),
        new Date(job.lastSeenAt),
      ];

      await executor.query(query, values);

      // Atualiza tags de tecnologia
      if (job.technologies.length > 0) {
        await this.syncJobTechnologies(job.id, job.technologies, executor);
      }

      return { isNew, job };
    } catch (err) {
      throw new DatabaseError(
        `Erro ao persistir vaga ${job.id}: ${(err as Error).message}`,
        err,
      );
    }
  }

  private async syncJobTechnologies(
    jobId: string,
    technologies: string[],
    executor: pg.Pool | pg.PoolClient,
  ): Promise<void> {
    for (const tech of technologies) {
      await executor.query(
        `
        INSERT INTO job_tags (job_id, tag_type, tag_name, confidence)
        VALUES ($1, 'technology', $2, 1.0)
        ON CONFLICT (job_id, tag_type, tag_name) DO NOTHING;
      `,
        [jobId, tech],
      );
    }
  }

  async findByCanonicalHash(hash: string): Promise<NormalizedJob | null> {
    const res = await this.pool.query(
      "SELECT * FROM jobs WHERE canonical_hash = $1 LIMIT 1",
      [hash],
    );
    if ((res.rowCount ?? 0) === 0) return null;
    return this.mapRowToJob(res.rows[0]);
  }

  async findById(id: string): Promise<NormalizedJob | null> {
    const res = await this.pool.query(
      "SELECT * FROM jobs WHERE id = $1 LIMIT 1",
      [id],
    );
    if ((res.rowCount ?? 0) === 0) return null;
    return this.mapRowToJob(res.rows[0]);
  }

  async countTotal(): Promise<number> {
    const res = await this.pool.query("SELECT COUNT(*) as count FROM jobs");
    return parseInt(res.rows[0]?.count ?? "0", 10);
  }

  private mapRowToJob(row: Record<string, unknown>): NormalizedJob {
    return {
      id: String(row.id),
      provider: String(row.provider),
      providerJobId: String(row.provider_job_id),
      company: String(row.company),
      title: String(row.title),
      description: String(row.description),
      location: row.location ? String(row.location) : null,
      remoteType: row.remote_type as NormalizedJob["remoteType"],
      seniority: row.seniority as NormalizedJob["seniority"],
      technologies: [],
      salaryMin: row.salary_min ? Number(row.salary_min) : null,
      salaryMax: row.salary_max ? Number(row.salary_max) : null,
      currency: row.currency ? String(row.currency) : null,
      country: row.country ? String(row.country) : null,
      eligibleRegions: Array.isArray(row.eligible_regions)
        ? (row.eligible_regions as string[])
        : [],
      employmentType: row.employment_type ? String(row.employment_type) : null,
      applyUrl: String(row.apply_url),
      sourceUrl: String(row.source_url),
      canonicalHash: String(row.canonical_hash),
      qualityScore: Number(row.quality_score),
      inferredData: (row.inferred_data as NormalizedJob["inferredData"]) || {},
      publishedAt: row.published_at
        ? new Date(String(row.published_at)).toISOString()
        : null,
      discoveredAt: new Date(String(row.discovered_at)).toISOString(),
      lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
      status: row.status as NormalizedJob["status"],
      isHistorical: Boolean(row.is_historical),
    };
  }
}
