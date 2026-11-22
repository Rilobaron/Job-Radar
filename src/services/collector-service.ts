import fs from "node:fs";
import path from "node:path";
import { providerRegistry } from "../providers/registry.js";
import { JobRepository } from "../persistence/job-repository.js";
import { SourceRepository } from "../persistence/source-repository.js";
import { RunRepository } from "../persistence/run-repository.js";
import { PublicationRepository } from "../persistence/publication-repository.js";
import { JobRouter } from "../publisher/router.js";
import { SpamFilter } from "../moderation/spam-filter.js";
import { logger } from "../observability/logger.js";
import type { SourceConfig, DiscordChannelConfig } from "../domain/models.js";

export interface CollectorSummary {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  totalCollected: number;
  totalNew: number;
  totalDuplicates: number;
  totalEnqueued: number;
  durationMs: number;
}

export class CollectorService {
  constructor(
    private jobRepo: JobRepository = new JobRepository(),
    private sourceRepo: SourceRepository = new SourceRepository(),
    private runRepo: RunRepository = new RunRepository(),
    private pubRepo: PublicationRepository = new PublicationRepository(),
    private spamFilter: SpamFilter = new SpamFilter(),
  ) {}

  async loadInitialSourcesIfNeeded(): Promise<SourceConfig[]> {
    let sources: SourceConfig[] = [];
    try {
      sources = await this.sourceRepo.getAll();
    } catch {
      // Caso a tabela ainda não exista ou banco offline
    }

    if (sources.length === 0) {
      const configPath = path.resolve(
        process.cwd(),
        "config",
        "default-sources.json",
      );
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const defaultSources = JSON.parse(raw) as SourceConfig[];
        for (const s of defaultSources) {
          try {
            await this.sourceRepo.upsert(s);
          } catch {
            // Em caso de banco não conectado, usa em memória
          }
        }
        sources = defaultSources;
      }
    }

    return sources;
  }

  async runCollection(options?: {
    markAsHistorical?: boolean;
  }): Promise<CollectorSummary> {
    const startTime = Date.now();
    const sources = await this.loadInitialSourcesIfNeeded();

    let channels: DiscordChannelConfig[] = [];
    try {
      channels = await this.pubRepo.getAllChannels();
    } catch {
      // Fallback para canais padrão do config se banco não acessível
    }

    if (channels.length === 0) {
      const chPath = path.resolve(
        process.cwd(),
        "config",
        "default-channels.json",
      );
      if (fs.existsSync(chPath)) {
        channels = JSON.parse(fs.readFileSync(chPath, "utf-8"));
      }
    }

    const router = new JobRouter(channels);

    const summary: CollectorSummary = {
      totalSources: sources.length,
      successfulSources: 0,
      failedSources: 0,
      totalCollected: 0,
      totalNew: 0,
      totalDuplicates: 0,
      totalEnqueued: 0,
      durationMs: 0,
    };

    logger.info(
      `Iniciando ciclo de coleta de vagas para ${sources.length} fontes...`,
    );

    for (const source of sources) {
      if (!source.enabled) {
        logger.info(`Fonte ${source.name} está desativada. Ignorando.`);
        continue;
      }

      const sourceStartTime = Date.now();
      const provider = providerRegistry.get(source.provider);

      if (!provider) {
        logger.error(
          `Provedor desconhecido "${source.provider}" para a fonte ${source.name}`,
        );
        summary.failedSources++;
        continue;
      }

      try {
        const jobs = await provider.collect(source);
        summary.successfulSources++;
        summary.totalCollected += jobs.length;

        let sourceNewCount = 0;
        let sourceDuplicateCount = 0;

        for (const job of jobs) {
          // 1. Moderação & Filtro de Spam
          const filterResult = this.spamFilter.evaluateJob(job);
          if (!filterResult.allowed) {
            logger.debug(
              `Vaga ${job.id} rejeitada pelo filtro: ${filterResult.reason}`,
            );
            continue;
          }

          // 2. Se for modo bootstrap, marca como histórico
          if (options?.markAsHistorical) {
            job.isHistorical = true;
          }

          // 3. Persistência
          try {
            const { isNew } = await this.jobRepo.upsertJob(job);
            if (isNew) {
              summary.totalNew++;
              sourceNewCount++;

              // 4. Roteamento e enfileiramento de publicações (se não for histórica)
              if (!job.isHistorical) {
                const targetChannels = router.routeJob(job);
                for (const ch of targetChannels) {
                  const enqueued = await this.pubRepo.enqueuePublication(
                    job.id,
                    ch.id,
                  );
                  if (enqueued) {
                    summary.totalEnqueued++;
                  }
                }
              }
            } else {
              summary.totalDuplicates++;
              sourceDuplicateCount++;
            }
          } catch (dbErr) {
            logger.warn(
              `Não foi possível persistir a vaga ${job.id}: ${(dbErr as Error).message}`,
            );
          }
        }

        // Registra observabilidade do ciclo da fonte
        try {
          await this.runRepo.recordRun({
            provider: source.provider,
            sourceIdentifier: source.identifier,
            status: "SUCCESS",
            durationMs: Date.now() - sourceStartTime,
            totalReceived: jobs.length,
            totalNew: sourceNewCount,
            totalDuplicates: sourceDuplicateCount,
          });
        } catch {
          // Ignora erro de registro se banco offline
        }
      } catch (err: unknown) {
        summary.failedSources++;
        const errorMsg = (err as Error).message;
        logger.error(
          `Falha ao coletar vagas da fonte ${source.name}: ${errorMsg}`,
        );

        try {
          await this.runRepo.recordRun({
            provider: source.provider,
            sourceIdentifier: source.identifier,
            status: "FAILED",
            durationMs: Date.now() - sourceStartTime,
            totalReceived: 0,
            totalNew: 0,
            totalDuplicates: 0,
            errorMessage: errorMsg,
          });
        } catch {
          // Ignora
        }
      }
    }

    summary.durationMs = Date.now() - startTime;
    logger.info(
      "Ciclo de coleta finalizado.",
      summary as unknown as Record<string, unknown>,
    );
    return summary;
  }
}
