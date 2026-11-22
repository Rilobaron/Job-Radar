import { ashbyResponseSchema } from "../domain/schemas.js";
import { classifyAndNormalizeJob } from "../classification/engine.js";
import { fetchWithRetryAndTimeout } from "./base.js";
import { ProviderError } from "../domain/errors.js";
import { logger } from "../observability/logger.js";
import type {
  JobProvider,
  NormalizedJob,
  SourceConfig,
} from "../domain/models.js";

export class AshbyProvider implements JobProvider {
  readonly name = "ashby";

  async collect(source: SourceConfig): Promise<NormalizedJob[]> {
    if (!source.enabled) {
      logger.info(`Fonte ${source.name} está desativada. Pulando.`);
      return [];
    }

    const baseUrl =
      source.baseUrl ||
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.identifier)}`;

    logger.debug(`Consultando Ashby para empresa ${source.name}...`, {
      url: baseUrl,
    });

    const rawData = await fetchWithRetryAndTimeout(baseUrl);

    const parseResult = ashbyResponseSchema.safeParse(rawData);
    if (!parseResult.success) {
      logger.error(`Ashby retornou schema inválido para ${source.name}:`, {
        errors: parseResult.error.issues,
      });
      throw new ProviderError(
        this.name,
        `Resposta da API do Ashby para ${source.identifier} não corresponde ao schema esperado`,
        parseResult.error.issues,
      );
    }

    const { jobs } = parseResult.data;
    const normalizedList: NormalizedJob[] = [];

    for (const job of jobs) {
      try {
        // Ignora vagas não listadas se isListed for false explicitamente
        if (job.isListed === false) {
          continue;
        }

        const description =
          job.descriptionPlain ??
          (job.descriptionHtml
            ? job.descriptionHtml.replace(/<[^>]*>/g, " ")
            : "");

        const applyUrl = job.applyUrl || job.jobUrl;
        if (!applyUrl) {
          continue;
        }

        // Determina modalidade se isRemote for true
        let workplaceType = job.workplaceType;
        if (!workplaceType && job.isRemote) {
          workplaceType = "remote";
        }

        const normalized = classifyAndNormalizeJob({
          provider: this.name,
          providerJobId: job.id,
          company: source.name,
          title: job.title,
          description: description.replace(/\s+/g, " ").trim(),
          location: job.location ?? null,
          rawWorkplaceType: workplaceType ?? null,
          applyUrl,
          sourceUrl: job.jobUrl || applyUrl,
          salaryMin: job.compensation?.minValue ?? null,
          salaryMax: job.compensation?.maxValue ?? null,
          currency: job.compensation?.currencyCode ?? null,
          employmentType: job.employmentType ?? null,
          publishedAt: job.publishedAt ?? null,
        });

        normalizedList.push(normalized);
      } catch (itemErr) {
        logger.warn(
          `Erro ao normalizar vaga ${job.id} de Ashby (${source.name}):`,
          {
            error: (itemErr as Error).message,
          },
        );
      }
    }

    logger.info(
      `Ashby coletou com sucesso ${normalizedList.length} vagas de ${source.name}.`,
    );
    return normalizedList;
  }
}
