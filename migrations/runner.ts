import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "../src/persistence/db.js";
import { logger } from "../src/observability/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    logger.info("Iniciando runner de migrations...");

    // Cria tabela de controle de migrations se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations_history (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const checkRes = await client.query(
        "SELECT 1 FROM _migrations_history WHERE name = $1",
        [file],
      );

      if ((checkRes.rowCount ?? 0) > 0) {
        logger.debug(`Migration já aplicada: ${file}`);
        continue;
      }

      logger.info(`Aplicando migration: ${file}...`);
      const sql = fs.readFileSync(path.join(__dirname, file), "utf-8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _migrations_history (name) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
        logger.info(`Migration ${file} aplicada com sucesso!`);
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error(`Erro ao aplicar migration ${file}:`, {
          error: (err as Error).message,
        });
        throw err;
      }
    }

    logger.info(
      "Todas as migrations foram verificadas e aplicadas com sucesso.",
    );
  } finally {
    client.release();
  }
}

// Execução direta via CLI
if (process.argv[1] === __filename) {
  runMigrations()
    .then(() => {
      logger.info("Migrações concluídas.");
      return closePool();
    })
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error("Falha na execução de migrações:", { error: err.message });
      await closePool().catch(() => {});
      process.exit(1);
    });
}
