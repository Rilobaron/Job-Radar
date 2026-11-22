import type { NormalizedJob, DiscordChannelConfig } from "../domain/models.js";

export class JobRouter {
  constructor(private availableChannels: DiscordChannelConfig[]) {}

  routeJob(job: NormalizedJob): DiscordChannelConfig[] {
    const matchedChannelIds = new Set<string>();

    // 1. Roteamento por Senioridade
    switch (job.seniority) {
      case "intern":
        matchedChannelIds.add("channel_intern");
        break;
      case "junior":
        matchedChannelIds.add("channel_junior");
        break;
      case "mid":
        matchedChannelIds.add("channel_mid");
        break;
      case "senior":
      case "staff":
        matchedChannelIds.add("channel_senior");
        break;
      case "unknown":
        // Não roteia para canais estritos de senioridade se for desconhecido
        break;
    }

    // 2. Roteamento por Região
    if (job.remoteType === "remote") {
      const isBrazilEligible =
        job.country === "Brazil" ||
        job.eligibleRegions.includes("Brazil") ||
        job.eligibleRegions.includes("LATAM");

      if (isBrazilEligible) {
        matchedChannelIds.add("channel_brazil_remote");
      }

      // Roteia para internacional APENAS se a vaga for elegível internacionalmente/globalmente
      // e NÃO estiver restrita exclusivamente a outro país específico
      if (job.eligibleRegions.includes("International")) {
        matchedChannelIds.add("channel_international");
      }
    }

    // 3. Roteamento por Compensação em Dólar (USD)
    // EXIGE evidência explícita de remuneração em USD
    const hasUsdEvidence =
      Boolean(job.inferredData?.usdEvidence) ||
      job.currency?.toUpperCase() === "USD" ||
      job.currency === "$";

    if (hasUsdEvidence) {
      matchedChannelIds.add("channel_usd");
    }

    // Filtra apenas os canais que estão cadastrados e ativos
    const selectedChannels = this.availableChannels.filter((c) =>
      matchedChannelIds.has(c.id),
    );

    // Se nenhum canal específico der match, ou se nenhum dos canais configurados estiver ativo,
    // mas houver um canal padrão geral ativo, o sistema pode recorrer a ele.
    return selectedChannels;
  }
}
