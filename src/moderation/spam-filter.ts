import { blocklistManager } from "./blocklist.js";
import type { NormalizedJob } from "../domain/models.js";

export interface FilterDecision {
  allowed: boolean;
  reason?: string;
}

export class SpamFilter {
  constructor(
    private minQualityScore: number = 30,
    private maxPublicationsPerRun: number = 5,
    private maxPublicationsDaily: number = 50,
  ) {}

  evaluateJob(job: NormalizedJob): FilterDecision {
    // 1. Verificação de URL de candidatura
    if (!job.applyUrl || !job.applyUrl.startsWith("http")) {
      return {
        allowed: false,
        reason: "URL de candidatura ausente ou malformada",
      };
    }

    // 2. Proteção contra empresas na blocklist
    if (blocklistManager.isCompanyBlocked(job.company)) {
      return {
        allowed: false,
        reason: `Empresa "${job.company}" está na blocklist`,
      };
    }

    // 3. Proteção contra domínios maliciosos ou bloqueados
    if (
      blocklistManager.isUrlBlocked(job.applyUrl) ||
      blocklistManager.isUrlBlocked(job.sourceUrl)
    ) {
      return {
        allowed: false,
        reason:
          "URL de candidatura ou de origem pertence a um domínio bloqueado",
      };
    }

    // 4. Score de qualidade mínima
    if (job.qualityScore < this.minQualityScore) {
      return {
        allowed: false,
        reason: `Score de qualidade insuficiente (${job.qualityScore} < ${this.minQualityScore})`,
      };
    }

    // 5. Título ou empresa vazios
    if (
      !job.title ||
      job.title.length < 3 ||
      !job.company ||
      job.company.length < 2
    ) {
      return {
        allowed: false,
        reason: "Título ou nome da empresa excessivamente curtos ou vazios",
      };
    }

    return { allowed: true };
  }

  isDailyLimitExceeded(sentToday: number): boolean {
    return sentToday >= this.maxPublicationsDaily;
  }

  getMaxPerRun(): number {
    return this.maxPublicationsPerRun;
  }
}
