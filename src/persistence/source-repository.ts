import type pg from "pg";
import { getPool } from "./db.js";
import type { SourceConfig } from "../domain/models.js";
import { DatabaseError } from "../domain/errors.js";

export class SourceRepository {
  constructor(private pool: pg.Pool = getPool()) {}

  async getAll(): Promise<SourceConfig[]> {
    try {
      const res = await this.pool.query(
        "SELECT * FROM sources ORDER BY name ASC",
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        provider: r.provider as SourceConfig["provider"],
        identifier: String(r.identifier),
        baseUrl: String(r.base_url),
        enabled: Boolean(r.enabled),
      }));
    } catch (err) {
      throw new DatabaseError(
        `Erro ao buscar fontes: ${(err as Error).message}`,
        err,
      );
    }
  }

  async upsert(source: SourceConfig): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO sources (id, name, provider, identifier, base_url, enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (provider, identifier) DO UPDATE SET
          name = EXCLUDED.name,
          base_url = EXCLUDED.base_url,
          enabled = EXCLUDED.enabled,
          updated_at = NOW();
      `,
        [
          source.id,
          source.name,
          source.provider,
          source.identifier,
          source.baseUrl,
          source.enabled,
        ],
      );
    } catch (err) {
      throw new DatabaseError(
        `Erro ao salvar fonte ${source.id}: ${(err as Error).message}`,
        err,
      );
    }
  }

  async toggle(id: string, enabled: boolean): Promise<boolean> {
    try {
      const res = await this.pool.query(
        "UPDATE sources SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
        [enabled, id],
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      throw new DatabaseError(
        `Erro ao alternar status da fonte ${id}: ${(err as Error).message}`,
        err,
      );
    }
  }
}
