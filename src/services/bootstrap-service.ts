import fs from "node:fs";
import path from "node:path";
import { CollectorService } from "./collector-service.js";
import { PublicationRepository } from "../persistence/publication-repository.js";
import { runMigrations } from "../../migrations/runner.js";
import { logger } from "../observability/logger.js";
import type { DiscordChannelConfig } from "../domain/models.js";

export class BootstrapService {
  constructor(
    private collectorService: CollectorService = new CollectorService(),
    private pubRepo: PublicationRepository = new PublicationRepository(),
  ) {}

  async runBootstrap(): Promise<void> {
    logger.info("=== INICIANDO BOOTSTRAP SEGURO DO JOBRADAR v1.0 ===");

    // 1. Executa migrações de schema
    try {
      logger.info("Verificando migrações de banco de dados...");
      await runMigrations();
    } catch (migErr) {
      logger.error("Falha ao rodar migrações no bootstrap:", {
        error: (migErr as Error).message,
      });
      throw migErr;
    }

    // 2. Sincroniza canais padrão
    try {
      const chPath = path.resolve(
        process.cwd(),
        "config",
        "default-channels.json",
      );
      if (fs.existsSync(chPath)) {
        const defaultChannels = JSON.parse(
          fs.readFileSync(chPath, "utf-8"),
        ) as DiscordChannelConfig[];
        await this.pubRepo.syncChannels(defaultChannels);
        logger.info(`Sincronizados ${defaultChannels.length} canais padrão.`);
      }
    } catch (syncErr) {
      logger.warn("Aviso ao sincronizar canais padrão:", {
        error: (syncErr as Error).message,
      });
    }

    // 3. Executa a primeira coleta marcando todas as vagas como históricas
    logger.info(
      "Executando coleta inicial segura (as vagas serão marcadas como históricas para evitar flood no Discord)...",
    );
    const summary = await this.collectorService.runCollection({
      markAsHistorical: true,
    });

    logger.info("=== BOOTSTRAP CONCLUÍDO COM SUCESSO ===");
    logger.info("Resumo do inventário inicial catalogado:", {
      totalFontes: summary.totalSources,
      totalVagasCatalogadas: summary.totalCollected,
      vagasNovasArmazenadas: summary.totalNew,
      duplicadasIdentificadas: summary.totalDuplicates,
      vagasDisparadasNoDiscord: 0, // Garantia de zero flood!
    });
    logger.info(
      "A partir de agora, novas vagas identificadas entrarão automaticamente na fila de publicação normal.",
    );
  }
}
