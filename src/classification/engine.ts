import crypto from "node:crypto";
import { classifySeniority } from "./seniority.js";
import { detectTechnologies } from "./technology.js";
import { classifyWorkMode } from "./work-mode.js";
import { classifyLocation } from "./location.js";
import { calculateQualityScore } from "./quality.js";
import type { NormalizedJob } from "../domain/models.js";

export interface ClassificationInput {
  provider: string;
  providerJobId: string;
  company: string;
  title: string;
  description: string;
  location: string | null;
  rawWorkplaceType?: string | null;
  applyUrl: string;
  sourceUrl: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  employmentType?: string | null;
  publishedAt?: string | null;
  discoveredAt?: string;
}

export function normalizeTitleForDeduplication(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, " ") // apenas letras e números
    .replace(/\s+/g, " ")
    .trim();
}

export function generateCanonicalHash(company: string, title: string): string {
  const normCompany = company.toLowerCase().trim();
  const normTitle = normalizeTitleForDeduplication(title);
  const raw = `${normCompany}|${normTitle}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function classifyAndNormalizeJob(
  input: ClassificationInput,
): NormalizedJob {
  const seniorityResult = classifySeniority(input.title, input.description);
  const techResult = detectTechnologies(input.title, input.description);
  const workModeResult = classifyWorkMode(
    input.rawWorkplaceType,
    input.title,
    input.location,
    input.description,
  );
  const locResult = classifyLocation(
    input.location,
    input.description,
    workModeResult.remoteType,
    input.currency,
  );

  const qualityScore = calculateQualityScore({
    company: input.company,
    applyUrl: input.applyUrl,
    description: input.description,
    remoteType: workModeResult.remoteType,
    seniority: seniorityResult.level,
    technologiesCount: techResult.technologies.length,
    hasSalary: input.salaryMin !== null || input.salaryMax !== null,
    publishedAt: input.publishedAt ?? null,
  });

  const canonicalHash = generateCanonicalHash(input.company, input.title);
  const now = new Date().toISOString();

  return {
    id: `${input.provider}_${input.providerJobId}`,
    provider: input.provider,
    providerJobId: input.providerJobId,
    company: input.company,
    title: input.title.trim(),
    description: input.description,
    location: input.location,
    remoteType: workModeResult.remoteType,
    seniority: seniorityResult.level,
    technologies: techResult.technologies,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    currency: input.currency ?? null,
    country: locResult.country,
    eligibleRegions: locResult.eligibleRegions,
    employmentType: input.employmentType ?? null,
    applyUrl: input.applyUrl,
    sourceUrl: input.sourceUrl,
    canonicalHash,
    qualityScore,
    inferredData: {
      seniorityEvidence: seniorityResult.evidence,
      seniorityConfidence: seniorityResult.confidence,
      remoteEvidence: workModeResult.evidence,
      remoteConfidence: workModeResult.confidence,
      usdEvidence: locResult.usdEvidence,
    },
    publishedAt: input.publishedAt ?? null,
    discoveredAt: input.discoveredAt ?? now,
    lastSeenAt: now,
    status: "active",
    isHistorical: false,
  };
}
