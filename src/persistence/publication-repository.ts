import type pg from "pg";
import { getPool } from "./db.js";
import type {
  DiscordChannelConfig,
  PublicationRecord,
  PublicationStatus,
  NormalizedJob,
} from "../domain/models.js";
import { DatabaseError } from "../domain/errors.js";

export class PublicationRepository {
  constructor(private pool: pg.Pool = getPool()) {}

  async syncChannels(channels: DiscordChannelConfig[]): Promise<void> {
    for (const ch of channels) {
      await this.pool.query(
        `
        INSERT INTO discord_channels (id, name, category, description, env_key, color, enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (name) DO UPDATE SET
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          env_key = EXCLUDED.env_key,
          color = EXCLUDED.color,
          updated_at = NOW();
      `,
        [
          ch.id,
          ch.name,
          ch.category,
          ch.description ?? null,
          ch.envKey,
          ch.color,
          ch.enabled ?? true,
        ],
      );
    }
  }

  async getAllChannels(): Promise<DiscordChannelConfig[]> {
    const res = await this.pool.query(
      "SELECT * FROM discord_channels WHERE enabled = true ORDER BY name ASC",
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      category: r.category as DiscordChannelConfig["category"],
      description: r.description ? String(r.description) : undefined,
      envKey: String(r.env_key),
      color: Number(r.color),
      enabled: Boolean(r.enabled),
    }));
  }

  async enqueuePublication(jobId: string, channelId: string): Promise<boolean> {
    try {
      const checkRes = await this.pool.query(
        "SELECT 1 FROM publications WHERE job_id = $1 AND channel_id = $2 LIMIT 1",
        [jobId, channelId],
      );
      if ((checkRes.rowCount ?? 0) > 0) {
        return false;
      }

      await this.pool.query(
        `
        INSERT INTO publications (job_id, channel_id, status, scheduled_at)
        VALUES ($1, $2, 'PENDING', NOW())
        ON CONFLICT (job_id, channel_id) DO NOTHING;
      `,
        [jobId, channelId],
      );
      return true;
    } catch (err) {
      throw new DatabaseError(
        `Erro ao enfileirar publicação: ${(err as Error).message}`,
        err,
      );
    }
  }

  // Consulta não-destrutiva para simulação (DRY_RUN): apenas lê sem alterar status ou bloquear
  async peekPendingPublications(
    channelId: string,
    limit: number,
  ): Promise<Array<{ publication: PublicationRecord; job: NormalizedJob }>> {
    const query = `
      SELECT
        p.id as pub_id, p.job_id, p.channel_id, p.status as pub_status,
        p.attempts_count, p.discord_message_id, p.last_error,
        j.*
      FROM publications p
      JOIN jobs j ON j.id = p.job_id
      WHERE p.channel_id = $1
        AND (
          p.status IN ('PENDING', 'RETRY')
          OR (p.status = 'SENDING' AND p.scheduled_at <= NOW())
        )
        AND p.scheduled_at <= NOW()
        AND j.status = 'active'
        AND j.is_historical = false
      ORDER BY p.scheduled_at ASC
      LIMIT $2;
    `;

    const res = await this.pool.query(query, [channelId, limit]);
    return res.rows.map((row) => ({
      publication: {
        id: Number(row.pub_id),
        jobId: String(row.job_id),
        channelId: String(row.channel_id),
        status: row.pub_status as PublicationStatus,
        attemptsCount: Number(row.attempts_count),
        discordMessageId: row.discord_message_id
          ? String(row.discord_message_id)
          : null,
        lastError: row.last_error ? String(row.last_error) : null,
      },
      job: {
        id: String(row.id),
        provider: String(row.provider),
        providerJobId: String(row.provider_job_id),
        company: String(row.company),
        title: String(row.title),
        description: String(row.description),
        location: row.location ? String(row.location) : null,
        remoteType: row.remote_type,
        seniority: row.seniority,
        technologies: [],
        salaryMin: row.salary_min ? Number(row.salary_min) : null,
        salaryMax: row.salary_max ? Number(row.salary_max) : null,
        currency: row.currency ? String(row.currency) : null,
        country: row.country ? String(row.country) : null,
        eligibleRegions: Array.isArray(row.eligible_regions)
          ? row.eligible_regions
          : [],
        employmentType: row.employment_type
          ? String(row.employment_type)
          : null,
        applyUrl: String(row.apply_url),
        sourceUrl: String(row.source_url),
        canonicalHash: String(row.canonical_hash),
        qualityScore: Number(row.quality_score),
        inferredData:
          (row.inferred_data as NormalizedJob["inferredData"]) || {},
        publishedAt: row.published_at
          ? new Date(String(row.published_at)).toISOString()
          : null,
        discoveredAt: new Date(String(row.discovered_at)).toISOString(),
        lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
        status: row.status,
        isHistorical: Boolean(row.is_historical),
      },
    }));
  }

  async getPendingPublications(
    channelId: string,
    limit: number,
  ): Promise<Array<{ publication: PublicationRecord; job: NormalizedJob }>> {
    // Tenta primeiro a aquisição atômica com lock de concorrência (FOR UPDATE SKIP LOCKED)
    // Se estiver em ambiente simulado ou driver sem suporte a SKIP LOCKED, faz fallback gracioso
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      let rows: any[] = [];
      try {
        const lockQuery = `
          SELECT
            p.id as pub_id, p.job_id, p.channel_id, p.status as pub_status,
            p.attempts_count, p.discord_message_id, p.last_error,
            j.*
          FROM publications p
          JOIN jobs j ON j.id = p.job_id
          WHERE p.channel_id = $1
            AND (
              p.status IN ('PENDING', 'RETRY')
              OR (p.status = 'SENDING' AND p.scheduled_at <= NOW())
            )
            AND p.scheduled_at <= NOW()
            AND j.status = 'active'
            AND j.is_historical = false
          ORDER BY p.scheduled_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED;
        `;
        const res = await client.query(lockQuery, [channelId, limit]);
        rows = res.rows;

        // Marca imediatamente como SENDING com lease de 5 minutos
        if (rows.length > 0) {
          const ids = rows.map((r) => r.pub_id);
          await client.query(
            `
            UPDATE publications
            SET status = 'SENDING', scheduled_at = NOW() + interval '5 minutes', updated_at = NOW()
            WHERE id = ANY($1::bigint[]);
          `,
            [ids],
          );
        }
      } catch {
        // Fallback para ambientes em memória (ex: pg-mem) que não suportam SKIP LOCKED
        const simpleQuery = `
          SELECT
            p.id as pub_id, p.job_id, p.channel_id, p.status as pub_status,
            p.attempts_count, p.discord_message_id, p.last_error,
            j.*
          FROM publications p
          JOIN jobs j ON j.id = p.job_id
          WHERE p.channel_id = $1
            AND (
              p.status IN ('PENDING', 'RETRY')
              OR (p.status = 'SENDING' AND p.scheduled_at <= NOW())
            )
            AND p.scheduled_at <= NOW()
            AND j.status = 'active'
            AND j.is_historical = false
          ORDER BY p.scheduled_at ASC
          LIMIT $2;
        `;
        const res = await client.query(simpleQuery, [channelId, limit]);
        rows = res.rows;

        for (const r of rows) {
          await client.query(
            "UPDATE publications SET status = 'SENDING', updated_at = NOW() WHERE id = $1",
            [r.pub_id],
          );
        }
      }

      await client.query("COMMIT");

      return rows.map((row) => ({
        publication: {
          id: Number(row.pub_id),
          jobId: String(row.job_id),
          channelId: String(row.channel_id),
          status: "SENDING" as PublicationStatus,
          attemptsCount: Number(row.attempts_count),
          discordMessageId: row.discord_message_id
            ? String(row.discord_message_id)
            : null,
          lastError: row.last_error ? String(row.last_error) : null,
        },
        job: {
          id: String(row.id),
          provider: String(row.provider),
          providerJobId: String(row.provider_job_id),
          company: String(row.company),
          title: String(row.title),
          description: String(row.description),
          location: row.location ? String(row.location) : null,
          remoteType: row.remote_type,
          seniority: row.seniority,
          technologies: [],
          salaryMin: row.salary_min ? Number(row.salary_min) : null,
          salaryMax: row.salary_max ? Number(row.salary_max) : null,
          currency: row.currency ? String(row.currency) : null,
          country: row.country ? String(row.country) : null,
          eligibleRegions: Array.isArray(row.eligible_regions)
            ? row.eligible_regions
            : [],
          employmentType: row.employment_type
            ? String(row.employment_type)
            : null,
          applyUrl: String(row.apply_url),
          sourceUrl: String(row.source_url),
          canonicalHash: String(row.canonical_hash),
          qualityScore: Number(row.quality_score),
          inferredData:
            (row.inferred_data as NormalizedJob["inferredData"]) || {},
          publishedAt: row.published_at
            ? new Date(String(row.published_at)).toISOString()
            : null,
          discoveredAt: new Date(String(row.discovered_at)).toISOString(),
          lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
          status: row.status,
          isHistorical: Boolean(row.is_historical),
        },
      }));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new DatabaseError(
        `Erro ao buscar e bloquear publicações pendentes: ${(err as Error).message}`,
        err,
      );
    } finally {
      client.release();
    }
  }

  async updatePublicationStatus(
    pubId: number,
    status: PublicationStatus,
    options?: {
      lastError?: string | null;
      discordMessageId?: string | null;
      retryInSeconds?: number;
    },
  ): Promise<void> {
    const scheduledAtSql = options?.retryInSeconds
      ? "NOW() + interval '" + options.retryInSeconds + " seconds'"
      : "scheduled_at";

    const publishedAtSql = status === "SENT" ? "NOW()" : "published_at";

    await this.pool.query(
      `
      UPDATE publications
      SET
        status = $1,
        attempts_count = attempts_count + 1,
        last_error = $2,
        discord_message_id = COALESCE($3, discord_message_id),
        scheduled_at = ${scheduledAtSql},
        published_at = ${publishedAtSql},
        updated_at = NOW()
      WHERE id = $4;
    `,
      [
        status,
        options?.lastError ?? null,
        options?.discordMessageId ?? null,
        pubId,
      ],
    );
  }

  async recordAttempt(
    pubId: number,
    attemptNumber: number,
    statusCode: number | null,
    responseBody: string | null,
    errorMessage: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO publication_attempts (
        publication_id, attempt_number, status_code,
        response_body, error_message, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6);
    `,
      [
        pubId,
        attemptNumber,
        statusCode,
        responseBody,
        errorMessage,
        durationMs,
      ],
    );
  }

  async countSentTodayByChannel(channelId: string): Promise<number> {
    const res = await this.pool.query(
      `
      SELECT COUNT(*) as count
      FROM publications
      WHERE channel_id = $1
        AND status = 'SENT'
        AND published_at >= NOW() - interval '24 hours';
    `,
      [channelId],
    );
    return parseInt(res.rows[0]?.count ?? "0", 10);
  }

  async isJobAlreadySentToWebhookUrl(
    jobId: string,
    targetWebhookUrl: string,
    channels: DiscordChannelConfig[],
  ): Promise<boolean> {
    const matchingChannelIds = channels
      .filter((c) => {
        const url = (process.env[c.envKey] || "").trim();
        return url.length > 0 && url === targetWebhookUrl;
      })
      .map((c) => c.id);

    if (matchingChannelIds.length <= 1) {
      return false;
    }

    try {
      const res = await this.pool.query(
        `
        SELECT 1 FROM publications
        WHERE job_id = $1
          AND channel_id = ANY($2::varchar[])
          AND status = 'SENT'
        LIMIT 1;
      `,
        [jobId, matchingChannelIds],
      );

      return (res.rowCount ?? 0) > 0;
    } catch {
      const res = await this.pool.query(
        `SELECT channel_id, status FROM publications WHERE job_id = $1 AND status = 'SENT'`,
        [jobId],
      );
      return res.rows.some((r: any) =>
        matchingChannelIds.includes(r.channel_id),
      );
    }
  }
}
