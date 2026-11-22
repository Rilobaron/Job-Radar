import { greenhouseResponseSchema } from "../domain/schemas.js";
import { classifyAndNormalizeJob } from "../classification/engine.js";
import { fetchWithRetryAndTimeout } from "./base.js";
import { ProviderError } from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import type {
  JobProvider,
  NormalizedJob,
  SourceConfig,
} from "../domain/models.js";

export class GreenhouseProvider implements JobProvider {
  readonly name = "greenhouse";

  async collect(source: SourceConfig): Promise<NormalizedJob[]> {
    if (!source.enabled) {
      logger.info(`Fonte ${source.name} está desativada. Pulando.`);
      return [];
    }

    // Monta a URL correta com content=true para extrair descrição completa
    const baseUrl = source.baseUrl.includes("content=true")
      ? source.baseUrl
      : `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.identifier)}/jobs?content=true`;

    logger.debug(`Consultando Greenhouse para empresa ${source.name}...`, {
      url: baseUrl,
    });

    const rawData = await fetchWithRetryAndTimeout(baseUrl);

    const parseResult = greenhouseResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.error(`Greenhouse retornou schema inválido para ${source.name}:`, {
        errors: parseResult.error.issues,
      });
      throw new ProviderError(
        this.name,
        `Resposta da API do Greenhouse para ${source.identifier} não corresponde ao schema esperado`,
        parseResult.error.issues,
      );
    }

    const { jobs } = parseResult.data;
    const normalizedList: NormalizedJob[] = [];

    for (const job of jobs) {
      try {
        const descriptionHtml = job.content ?? "";
        // Remove tags HTML básicas para o texto de análise
        const descriptionPlain = descriptionHtml
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const locationName = job.location?.name ?? null;

        const normalized = classifyAndNormalizeJob({
          provider: this.name,
          providerJobId: String(job.id),
          company: source.name,
          title: job.title,
          description: descriptionPlain,
          location: locationName,
          applyUrl: job.absolute_url,
          sourceUrl: job.absolute_url,
          publishedAt: job.first_published ?? job.updated_at ?? null,
        });

        normalizedList.push(normalized);
      } catch (itemErr) {
        logger.warn(`Erro ao normalizar vaga ${job.id} de ${source.name}:`, {
          error: (itemErr as Error).message,
        });
      }
    }

    logger.info(
      `Greenhouse coletou com sucesso ${normalizedList.length} vagas de ${source.name}.`,
    );
    return normalizedList;
  }
}
