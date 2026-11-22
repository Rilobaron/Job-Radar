import { PublicationRepository } from "../persistence/publication-repository.js";
import { DiscordClient } from "../publisher/discord-client.js";
import { buildJobEmbed } from "../publisher/embed.js";
import { SpamFilter } from "../moderation/spam-filter.js";
import { logger } from "../observability/logger.js";

export interface PublisherSummary {
  totalAttempted: number;
  totalSent: number;
  totalFailed: number;
  totalSkipped: number;
  isDryRun: boolean;
  durationMs: number;
}

export class PublisherService {
  private discordClient: DiscordClient;
  private spamFilter: SpamFilter;

  constructor(
    private pubRepo: PublicationRepository = new PublicationRepository(),
    private isDryRun: boolean = false,
    private minIntervalMs: number = 800,
  ) {
    this.discordClient = new DiscordClient(this.isDryRun, this.minIntervalMs);
    this.spamFilter = new SpamFilter();
  }

  async runPublication(): Promise<PublisherSummary> {
    const startTime = Date.now();
    const channels = await this.pubRepo.getAllChannels();

    const isPublicationEnabled = process.env.PUBLICATION_ENABLED === "true";
    let isDryRun = this.isDryRun || process.env.DRY_RUN === "true";

    // Trava de segurança: se publicação real não estiver explicitamente autorizada, força modo simulação
    if (!isPublicationEnabled && !isDryRun) {
      logger.warn(
        "[TRAVA DE SEGURANÇA] PUBLICATION_ENABLED=false. Envios reais para o Discord estão bloqueados por padrão. Executando em modo de segurança (simulação DRY_RUN).",
      );
      isDryRun = true;
    }

    this.discordClient = new DiscordClient(isDryRun, this.minIntervalMs);

    const summary: PublisherSummary = {
      totalAttempted: 0,
      totalSent: 0,
      totalFailed: 0,
      totalSkipped: 0,
      isDryRun,
      durationMs: 0,
    };

    logger.info(
      `Iniciando ciclo de publicação para ${channels.length} canais Discord... (DRY_RUN=${isDryRun}, PUBLICATION_ENABLED=${isPublicationEnabled})`,
    );

    const defaultWebhook = process.env.DISCORD_WEBHOOK_DEFAULT || "";

    for (const channel of channels) {
      if (!channel.enabled) {
        continue;
      }

      // 1. Resolve o webhook configurado para este canal
      const channelWebhook = (
        process.env[channel.envKey] || defaultWebhook
      ).trim();

      if (!channelWebhook && !isDryRun) {
        logger.warn(
          `Canal ${channel.name} (${channel.id}) não possui webhook configurado em ${channel.envKey} nem DISCORD_WEBHOOK_DEFAULT. Pulando envio deste canal.`,
        );
        continue;
      }

      // 2. Verifica limite diário do canal
      const sentToday = await this.pubRepo.countSentTodayByChannel(channel.id);
      if (this.spamFilter.isDailyLimitExceeded(sentToday)) {
        logger.warn(
          `Limite diário de publicações atingido para o canal ${channel.name} (${sentToday} enviadas hoje).`,
        );
        continue;
      }

      // 3. Busca publicações pendentes respeitando limite por execução
      // Em simulação DRY_RUN, faz leitura limpa não-destrutiva sem reservar/bloquear registros
      const maxPerRun = this.spamFilter.getMaxPerRun();
      const pendings = isDryRun
        ? await this.pubRepo.peekPendingPublications(channel.id, maxPerRun)
        : await this.pubRepo.getPendingPublications(channel.id, maxPerRun);

      if (pendings.length === 0) {
        logger.debug(
          `Nenhuma publicação pendente para o canal ${channel.name}.`,
        );
        continue;
      }

      logger.info(
        `Processando ${pendings.length} publicações pendentes para o canal ${channel.name}...`,
      );

      for (const item of pendings) {
        summary.totalAttempted++;
        const pubId = item.publication.id!;

        const embedPayload = buildJobEmbed(item.job, channel);
        const result = await this.discordClient.sendWebhook(
          channelWebhook,
          embedPayload,
        );

        // Se for DRY_RUN, NÃO persistimos tentativas, não alteramos status no banco
        // e não poluímos o histórico. As publicações permanecem intactas em PENDING.
        if (isDryRun) {
          if (result.success) {
            summary.totalSent++;
            logger.info(
              `[DRY-RUN] Simulação: Vaga "${item.job.title}" seria publicada no canal ${channel.name}.`,
            );
          } else {
            summary.totalFailed++;
            logger.warn(
              `[DRY-RUN] Simulação: Vaga "${item.job.title}" falharia no canal ${channel.name}: ${result.error}`,
            );
          }
          continue;
        }

        // Fluxo REAL de envio e persistência de auditoria
        await this.pubRepo.recordAttempt(
          pubId,
          item.publication.attemptsCount + 1,
          result.statusCode ?? null,
          result.messageId ?? null,
          result.error ?? null,
          result.durationMs,
        );

        if (result.success) {
          summary.totalSent++;
          await this.pubRepo.updatePublicationStatus(pubId, "SENT", {
            discordMessageId: result.messageId,
          });
          logger.info(
            `Vaga "${item.job.title}" publicada com sucesso no canal ${channel.name}.`,
          );
        } else {
          summary.totalFailed++;
          const maxRetries = 3;
          const currentAttempts = item.publication.attemptsCount + 1;

          if (currentAttempts >= maxRetries) {
            await this.pubRepo.updatePublicationStatus(pubId, "FAILED", {
              lastError: result.error,
            });
            logger.error(
              `Publicação ${pubId} falhou definitivamente após ${currentAttempts} tentativas: ${result.error}`,
            );
          } else {
            const retrySeconds =
              result.retryAfterSeconds ?? Math.pow(2, currentAttempts) * 60;
            await this.pubRepo.updatePublicationStatus(pubId, "RETRY", {
              lastError: result.error,
              retryInSeconds: retrySeconds,
            });
            logger.warn(
              `Publicação ${pubId} agendada para retentativa em ${retrySeconds}s. Erro: ${result.error}`,
            );
          }
        }
      }
    }

    summary.durationMs = Date.now() - startTime;
    logger.info(
      "Ciclo de publicação concluído.",
      summary as unknown as Record<string, unknown>,
    );
    return summary;
  }
}
