import { CollectorService } from "../services/collector-service.js";
import { PublisherService } from "../services/publisher-service.js";
import { BootstrapService } from "../services/bootstrap-service.js";
import { JobRepository } from "../persistence/job-repository.js";
import { SourceRepository } from "../persistence/source-repository.js";
import { RunRepository } from "../persistence/run-repository.js";
import { getPool, closePool } from "../persistence/db.js";
import { blocklistManager } from "../moderation/blocklist.js";
import { providerRegistry } from "../providers/registry.js";
import { logger } from "../observability/logger.js";
import { getEnv } from "../config/env.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  try {
    switch (command) {
      case "collect": {
        const collector = new CollectorService();
        await collector.runCollection();
        break;
      }

      case "publish": {
        const publisher = new PublisherService();
        await publisher.runPublication();
        break;
      }

      case "bootstrap": {
        const bootstrap = new BootstrapService();
        await bootstrap.runBootstrap();
        break;
      }

      case "dry-run": {
        logger.info("=== EXECUTANDO SIMULAÇÃO PONTAPÉ (DRY_RUN) ===");
        process.env.DRY_RUN = "true";

        // Se DATABASE_URL não estiver configurada, provisiona banco em memória transparente para dry-run
        if (!process.env.DATABASE_URL) {
          logger.info(
            "[DRY-RUN] DATABASE_URL não definida. Inicializando PostgreSQL em memória para simulação segura...",
          );
          const { newDb } = await import("pg-mem");
          const fs = await import("node:fs");
          const memDb = newDb();
          const runnerSql1 = fs.readFileSync(
            "migrations/001_initial_schema.sql",
            "utf-8",
          );
          const safeSql = runnerSql1
            .replace(/CREATE EXTENSION[^\n;]+;/gi, "")
            .replace(/DEFAULT gen_random_uuid\(\)/gi, "")
            .replace(/UUID PRIMARY KEY/gi, "TEXT PRIMARY KEY")
            .replace(/BIGSERIAL/gi, "SERIAL");
          memDb.public.none(safeSql);
          const memPool = new (memDb.adapters.createPg().Pool)();
          const { setCustomPool } = await import("../persistence/db.js");
          setCustomPool(memPool);

          // Sincroniza canais padrão no banco em memória
          const { PublicationRepository } =
            await import("../persistence/publication-repository.js");
          const pRepo = new PublicationRepository(memPool);
          const defaultChannels = JSON.parse(
            fs.readFileSync("config/default-channels.json", "utf-8"),
          );
          await pRepo.syncChannels(defaultChannels);
        }

        const collector = new CollectorService();
        await collector.runCollection();
        const publisher = new PublisherService(undefined, true);
        await publisher.runPublication();
        logger.info("=== SIMULAÇÃO CONCLUÍDA COM SUCESSO ===");
        break;
      }

      case "status": {
        logger.info("=== STATUS OPERACIONAL DO JOBRADAR ===");
        const pool = getPool();
        const client = await pool.connect();
        try {
          const jobRepo = new JobRepository(pool);
          const sourceRepo = new SourceRepository(pool);
          const runRepo = new RunRepository(pool);

          const totalJobs = await jobRepo.countTotal();
          const sources = await sourceRepo.getAll();
          const activeSources = sources.filter((s) => s.enabled).length;

          const pubRes = await client.query(`
            SELECT status, count(*) as count
            FROM publications
            GROUP BY status
          `);

          const recentRuns = await runRepo.getRecentRuns(5);

          console.log(`
--------------------------------------------------
📊 RESUMO OPERACIONAL:
--------------------------------------------------
Total de Vagas Cadastradas:  ${totalJobs}
Fontes Cadastradas:         ${sources.length} (${activeSources} ativas)
Fila de Publicações:
${pubRes.rows.map((r) => `  - ${r.status}: ${r.count}`).join("\n") || "  (Vazia)"}

Últimas Execuções de Coleta:
${
  recentRuns
    .map(
      (r: any) =>
        `  - [${r.provider}] ${r.source_identifier}: ${r.status} (${r.total_received} vagas, ${r.duration_ms}ms) em ${r.started_at}`,
    )
    .join("\n") || "  (Nenhum registro encontrado)"
}
--------------------------------------------------
          `);
        } finally {
          client.release();
        }
        break;
      }

      case "health": {
        logger.info("=== CHECAGEM DE SAÚDE DO SISTEMA (HEALTH CHECK) ===");
        const results = {
          database: false,
          env: false,
          providers: [] as string[],
        };

        // 1. Testa variáveis de ambiente
        try {
          getEnv();
          results.env = true;
          console.log("✅ Configuração de Variáveis de Ambiente: OK");
        } catch (e) {
          console.error(
            "❌ Configuração de Variáveis de Ambiente: FALHA",
            (e as Error).message,
          );
        }

        // 2. Testa conexão com PostgreSQL
        try {
          const pool = getPool();
          const res = await pool.query(
            "SELECT NOW() as now, version() as version;",
          );
          results.database = true;
          console.log(
            `✅ Conexão com PostgreSQL: OK (${res.rows[0]?.version?.slice(0, 40)}...)`,
          );
        } catch (e) {
          console.error(
            "❌ Conexão com PostgreSQL: FALHA",
            (e as Error).message,
          );
        }

        // 3. Provedores registrados
        const registered = providerRegistry.getAll().map((p) => p.name);
        results.providers = registered;
        console.log(
          `✅ Conectores Registrados (${registered.length}): ${registered.join(", ")}`,
        );

        const allHealthy = results.database && results.env;
        if (allHealthy) {
          console.log("\n🟢 SISTEMA SAUDÁVEL E PRONTO PARA OPERAÇÃO.");
        } else {
          console.log(
            "\n🟡 SISTEMA PARCIALMENTE OPERACIONAL (Verifique avisos acima).",
          );
        }
        break;
      }

      case "sources:list": {
        const sourceRepo = new SourceRepository();
        const sources = await sourceRepo.getAll();
        console.table(
          sources.map((s) => ({
            ID: s.id,
            Nome: s.name,
            Provedor: s.provider,
            Identificador: s.identifier,
            Ativo: s.enabled ? "SIM" : "NÃO",
          })),
        );
        break;
      }

      case "sources:toggle": {
        const id = args[1];
        const state = args[2] === "true";
        if (!id) {
          console.error("Uso: npm run ... sources:toggle <id> <true|false>");
          process.exit(1);
        }
        const sourceRepo = new SourceRepository();
        const success = await sourceRepo.toggle(id, state);
        console.log(
          success
            ? `Fonte ${id} atualizada para ${state}`
            : `Fonte ${id} não encontrada.`,
        );
        break;
      }

      case "sources:test": {
        const providerName = args[1];
        const identifier = args[2];
        if (!providerName || !identifier) {
          console.error(
            "Uso: npm run ... sources:test <provider> <identifier>",
          );
          process.exit(1);
        }
        const provider = providerRegistry.get(providerName);
        if (!provider) {
          console.error(`Provedor "${providerName}" não encontrado.`);
          process.exit(1);
        }
        console.log(`Testando ${providerName} para "${identifier}"...`);
        const jobs = await provider.collect({
          id: `test_${identifier}`,
          name: identifier,
          provider: providerName as any,
          identifier,
          baseUrl: "",
          enabled: true,
        });
        console.log(`Sucesso! ${jobs.length} vagas encontradas.`);
        if (jobs.length > 0) {
          console.log("Exemplo da primeira vaga:", {
            title: jobs[0]?.title,
            seniority: jobs[0]?.seniority,
            remoteType: jobs[0]?.remoteType,
            technologies: jobs[0]?.technologies,
            qualityScore: jobs[0]?.qualityScore,
          });
        }
        break;
      }

      case "blocklist:list": {
        console.log(
          "Empresas Bloqueadas:",
          blocklistManager.getAllBlockedCompanies(),
        );
        console.log(
          "Domínios Bloqueados:",
          blocklistManager.getAllBlockedDomains(),
        );
        break;
      }

      case "blocklist:add": {
        const company = args[1];
        if (!company) {
          console.error("Uso: npm run ... blocklist:add <nome-da-empresa>");
          process.exit(1);
        }
        blocklistManager.addBlockedCompany(company);
        console.log(
          `Empresa "${company}" adicionada à blocklist de moderação.`,
        );
        break;
      }

      case "help":
      default: {
        console.log(`
JobRadar v1.0 - Interface de Linha de Comando (CLI)

Comandos Operacionais:
  npm run collect                     Executa ciclo de coleta de vagas
  npm run publish                     Executa ciclo de publicação de vagas pendentes
  npm run bootstrap                   Executa bootstrap histórico seguro
  npm run dry-run                     Simula coleta e publicação sem disparos reais
  npm run status                      Exibe estatísticas operacionais e fila
  npm run health                      Verifica saúde do banco, envs e provedores
  npm run migrate                     Executa migrações pendentes no PostgreSQL

Comandos Administrativos:
  npx tsx src/cli/index.ts sources:list                 Lista todas as fontes
  npx tsx src/cli/index.ts sources:toggle <id> <state>  Ativa/desativa uma fonte
  npx tsx src/cli/index.ts sources:test <prov> <ident>  Valida provedor e empresa
  npx tsx src/cli/index.ts blocklist:list               Lista itens da blocklist
  npx tsx src/cli/index.ts blocklist:add <company>      Adiciona empresa à blocklist
        `);
        break;
      }
    }
  } catch (err) {
    logger.error("Erro na execução do comando:", {
      error: (err as Error).message,
    });
    process.exitCode = 1;
  } finally {
    await closePool().catch(() => {});
  }
}

main();
