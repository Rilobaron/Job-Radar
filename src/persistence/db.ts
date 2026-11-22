import pg from "pg";
import { logger } from "../observability/logger.js";
import { DatabaseError } from "../domain/errors.js";

const { Pool } = pg;

let globalPool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (globalPool) {
    return globalPool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new DatabaseError(
      "DATABASE_URL não configurada no ambiente. Não é possível conectar ao PostgreSQL.",
    );
  }

  const isSupabase =
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com");

  globalPool = new Pool({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  globalPool.on("error", (err) => {
    logger.error("Erro inesperado no pool de conexões PostgreSQL:", {
      error: err.message,
    });
  });

  return globalPool;
}

export function setCustomPool(customPool: pg.Pool): void {
  globalPool = customPool;
}

export async function closePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}
