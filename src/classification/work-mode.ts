import type { RemoteType } from "../domain/models.js";

export interface WorkModeClassification {
  remoteType: RemoteType;
  confidence: number;
  evidence: string;
}

const NEGATIVE_REMOTE_PATTERNS = [
  /not\s+remote/i,
  /no\s+remote/i,
  /non-remote/i,
  /remote\s+sensing/i,
  /remote\s+control/i,
  /remote\s+possibility/i,
  /n[ãa]o\s+[ée]\s+remoto/i,
  /sem\s+op[çc][ãa]o\s+remota/i,
];

const HYBRID_PATTERNS = [
  /\bh[íi]brido\b/i,
  /\bhybrid\b/i,
  /\b\d+\s*days?\s+(?:in\s+office|presencial)/i,
  /\bdias?\s+presenciais?\b/i,
];

const ONSITE_PATTERNS = [
  /\bpresencial\b/i,
  /\bon-?site\b/i,
  /\bin-?office\b/i,
  /\b100%\s+presencial\b/i,
];

const REMOTE_PATTERNS = [
  /\b100%\s+remoto\b/i,
  /\b100%\s+remote\b/i,
  /\bremote\s*-\s*first\b/i,
  /\bfully\s+remote\b/i,
  /\btotalmente\s+remoto\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\btrabalhe\s+de\s+qualquer\s+lugar\b/i,
  /\bremote\b/i,
  /\bremoto\b/i,
];

export function classifyWorkMode(
  rawWorkplaceType: string | undefined | null,
  title: string,
  location: string | null = "",
  description: string = "",
): WorkModeClassification {
  // 1. Metadado explícito do provedor (alta confiança)
  if (rawWorkplaceType) {
    const norm = rawWorkplaceType.toLowerCase().trim();
    if (norm === "remote" || norm === "telecommute") {
      return {
        remoteType: "remote",
        confidence: 0.99,
        evidence: `Atributo workplaceType do provedor: "${rawWorkplaceType}"`,
      };
    }
    if (norm === "hybrid") {
      return {
        remoteType: "hybrid",
        confidence: 0.99,
        evidence: `Atributo workplaceType do provedor: "${rawWorkplaceType}"`,
      };
    }
    if (norm === "onsite" || norm === "in_office" || norm === "office") {
      return {
        remoteType: "onsite",
        confidence: 0.99,
        evidence: `Atributo workplaceType do provedor: "${rawWorkplaceType}"`,
      };
    }
  }

  const combinedHeader = `${title} | ${location ?? ""}`;

  // 2. Checa o campo de localização ou título
  for (const neg of NEGATIVE_REMOTE_PATTERNS) {
    if (neg.test(combinedHeader)) {
      return {
        remoteType: "onsite",
        confidence: 0.9,
        evidence: `Negação explícita no título/local: "${combinedHeader.match(neg)?.[0]}"`,
      };
    }
  }

  for (const h of HYBRID_PATTERNS) {
    const match = combinedHeader.match(h);
    if (match) {
      return {
        remoteType: "hybrid",
        confidence: 0.95,
        evidence: `Marcador híbrido no título/local: "${match[0]}"`,
      };
    }
  }

  for (const r of REMOTE_PATTERNS) {
    const match = combinedHeader.match(r);
    if (match) {
      return {
        remoteType: "remote",
        confidence: 0.95,
        evidence: `Marcador remoto no título/local: "${match[0]}"`,
      };
    }
  }

  for (const o of ONSITE_PATTERNS) {
    const match = combinedHeader.match(o);
    if (match) {
      return {
        remoteType: "onsite",
        confidence: 0.9,
        evidence: `Marcador presencial no título/local: "${match[0]}"`,
      };
    }
  }

  // 3. Análise da descrição se os cabeçalhos não foram conclusivos
  // Primeiro remove negações
  let safeDesc = description;
  for (const neg of NEGATIVE_REMOTE_PATTERNS) {
    safeDesc = safeDesc.replace(neg, " ");
  }

  for (const h of HYBRID_PATTERNS) {
    const match = safeDesc.match(h);
    if (match) {
      return {
        remoteType: "hybrid",
        confidence: 0.8,
        evidence: `Marcador híbrido na descrição: "${match[0]}"`,
      };
    }
  }

  for (const r of REMOTE_PATTERNS) {
    const match = safeDesc.match(r);
    if (match) {
      return {
        remoteType: "remote",
        confidence: 0.75,
        evidence: `Marcador remoto na descrição: "${match[0]}"`,
      };
    }
  }

  return {
    remoteType: "unknown",
    confidence: 0,
    evidence: "Modalidade de trabalho não especificada explicitamente",
  };
}
