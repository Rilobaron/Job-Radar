import type pg from "pg";
import { getPool } from "./db.js";
import type { CollectionRunResult } from "../domain/models.js";
import { DatabaseError } from "../domain/errors.js";

export class RunRepository {
  constructor(private pool: pg.Pool = getPool()) {}

  async recordRun(result: CollectionRunResult): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO collection_runs (
          provider, source_identifier, status, duration_ms,
          total_received, total_new, total_duplicates, error_message,
          completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());
      `,
        [
          result.provider,
          result.sourceIdentifier,
          result.status,
          result.durationMs,
          result.totalReceived,
          result.totalNew,
          result.totalDuplicates,
          result.errorMessage ?? null,
        ],
      );
    } catch (err) {
      throw new DatabaseError(
        `Erro ao registrar execução de coleta: ${(err as Error).message}`,
        err,
      );
    }
  }

  async getRecentRuns(limit: number = 10): Promise<unknown[]> {
    const res = await this.pool.query(
      "SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT $1",
      [limit],
    );
    return res.rows;
  }
}
