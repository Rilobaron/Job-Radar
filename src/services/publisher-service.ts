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
  private maxRetries: number;

  constructor(
    private pubRepo: PublicationRepository = new PublicationRepository(),
    private isDryRun: boolean = false,
    private minIntervalMs: number = 800,
    maxRetries?: number,
  ) {
    this.discordClient = new DiscordClient(this.isDryRun, this.minIntervalMs);
    this.spamFilter = new SpamFilter();
    this.maxRetries =
      maxRetries ??
      (process.env.MAX_RETRIES ? parseInt(process.env.MAX_RETRIES, 10) : 3);
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

    // Rastreador de envios por webhook físico para evitar que uma mesma vaga
    // seja postada mais de uma vez quando múltiplos canais lógicos compartilham o mesmo webhook
    const sentWebhookJobKeys = new Set<string>();

    for (const channel of channels) {
      if (!channel.enabled) {
        continue;
      }

      // 1. Resolve o webhook configurado especificamente para este canal
      // NUNCA redireciona silenciosamente categorias ausentes para um único canal padrão
      const channelWebhook = (process.env[channel.envKey] || "").trim();

      if (!channelWebhook) {
        if (!isDryRun) {
          logger.warn(
            `[CANAL PENDENTE] Canal "${channel.name}" (${channel.id}) não possui webhook configurado em ${channel.envKey}. Publicação mantida pendente na fila para este canal.`,
          );
        }
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
        const webhookJobKey = `${channelWebhook}::${item.job.id}`;

        // Prevenção de duplicatas quando canais lógicos compartilham o mesmo webhook URL
        if (sentWebhookJobKeys.has(webhookJobKey)) {
          logger.info(
            `[DEDUP WEBHOOK COMPARTILHADO] Vaga "${item.job.title}" já enviada ao mesmo webhook neste ciclo (${channel.name}). Evitando duplicata.`,
          );
          if (!isDryRun) {
            await this.pubRepo.updatePublicationStatus(pubId, "SENT", {
              discordMessageId: "shared_webhook_dedup",
            });
          }
          summary.totalSkipped++;
          continue;
        }

        const alreadySentToWebhook =
          await this.pubRepo.isJobAlreadySentToWebhookUrl(
            item.job.id,
            channelWebhook,
            channels,
          );
        if (alreadySentToWebhook) {
          logger.info(
            `[DEDUP HISTÓRICO WEBHOOK] Vaga "${item.job.title}" já consta como enviada a este webhook anteriormente. Marcando publicação como resolvida sem duplicar mensagem.`,
          );
          if (!isDryRun) {
            await this.pubRepo.updatePublicationStatus(pubId, "SENT", {
              discordMessageId: "shared_webhook_dedup",
            });
          }
          summary.totalSkipped++;
          continue;
        }

        const embedPayload = buildJobEmbed(item.job, channel);
        const result = await this.discordClient.sendWebhook(
          channelWebhook,
          embedPayload,
        );

        // Se for DRY_RUN, NÃO persistimos tentativas, não alteramos status no banco
        // e não poluímos o histórico. As publicações permanecem intactas em PENDING.
        if (isDryRun) {
          if (result.success) {
            sentWebhookJobKeys.add(webhookJobKey);
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

        // Garantia de confirmação externa estrita: status 200/204 e messageId comprovado
        const isConfirmedByDiscord =
          result.success &&
          result.statusCode !== undefined &&
          (result.statusCode === 200 || result.statusCode === 204) &&
          Boolean(result.messageId);

        if (isConfirmedByDiscord) {
          sentWebhookJobKeys.add(webhookJobKey);
          summary.totalSent++;
          await this.pubRepo.updatePublicationStatus(pubId, "SENT", {
            discordMessageId: result.messageId,
          });
          logger.info(
            `Vaga "${item.job.title}" publicada com sucesso no canal ${channel.name} (Message ID: ${result.messageId}).`,
          );
        } else {
          summary.totalFailed++;
          const currentAttempts = item.publication.attemptsCount + 1;

          if (currentAttempts >= this.maxRetries) {
            await this.pubRepo.updatePublicationStatus(pubId, "FAILED", {
              lastError: result.error || "Sem confirmação externa do Discord",
            });
            logger.error(
              `Publicação ${pubId} falhou definitivamente após ${currentAttempts} tentativas: ${result.error}`,
            );
          } else {
            const retrySeconds =
              result.retryAfterSeconds ?? Math.pow(2, currentAttempts) * 60;
            await this.pubRepo.updatePublicationStatus(pubId, "RETRY", {
              lastError: result.error || "Sem confirmação externa do Discord",
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
