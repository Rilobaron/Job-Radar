import { leverResponseSchema } from "../domain/schemas.js";
import { classifyAndNormalizeJob } from "../classification/engine.js";
import { fetchWithRetryAndTimeout } from "./base.js";
import { ProviderError } from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import type {
  JobProvider,
  NormalizedJob,
  SourceConfig,
} from "../domain/models.js";

export class LeverProvider implements JobProvider {
  readonly name = "lever";

  async collect(source: SourceConfig): Promise<NormalizedJob[]> {
    if (!source.enabled) {
      logger.info(`Fonte ${source.name} está desativada. Pulando.`);
      return [];
    }

    const baseUrl = source.baseUrl.includes("mode=json")
      ? source.baseUrl
      : `https://api.lever.co/v0/postings/${encodeURIComponent(source.identifier)}?mode=json`;

    logger.debug(`Consultando Lever para empresa ${source.name}...`, {
      url: baseUrl,
    });

    const rawData = await fetchWithRetryAndTimeout(baseUrl);

    const parseResult = leverResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.error(`Lever retornou schema inválido para ${source.name}:`, {
        errors: parseResult.error.issues,
      });
      throw new ProviderError(
        this.name,
        `Resposta da API do Lever para ${source.identifier} não corresponde ao schema esperado`,
        parseResult.error.issues,
      );
    }

    const postings = parseResult.data;
    const normalizedList: NormalizedJob[] = [];

    for (const posting of postings) {
      try {
        const description =
          posting.descriptionPlain ??
          (posting.description
            ? posting.description.replace(/<[^>]*>/g, " ")
            : "");

        const location = posting.categories?.location ?? null;
        const applyUrl = posting.applyUrl ?? posting.hostedUrl;

        // Se createdAt for timestamp em ms (ex: 1729000000000)
        let publishedAt: string | null = null;
        if (posting.createdAt) {
          publishedAt = new Date(posting.createdAt).toISOString();
        }

        const normalized = classifyAndNormalizeJob({
          provider: this.name,
          providerJobId: posting.id,
          company: source.name,
          title: posting.text,
          description: description.replace(/\s+/g, " ").trim(),
          location,
          rawWorkplaceType: posting.workplaceType ?? null,
          applyUrl,
          sourceUrl: posting.hostedUrl,
          employmentType: posting.categories?.commitment ?? null,
          publishedAt,
        });

        normalizedList.push(normalized);
      } catch (itemErr) {
        logger.warn(
          `Erro ao normalizar vaga ${posting.id} do Lever (${source.name}):`,
          {
            error: (itemErr as Error).message,
          },
        );
      }
    }

    logger.info(
      `Lever coletou com sucesso ${normalizedList.length} vagas de ${source.name}.`,
    );
    return normalizedList;
  }
}
