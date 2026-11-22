export interface QualityInput {
  company: string;
  applyUrl: string;
  description: string;
  remoteType: string;
  seniority: string;
  technologiesCount: number;
  hasSalary: boolean;
  publishedAt: string | null;
}

export function calculateQualityScore(input: QualityInput): number {
  let score = 0;

  // 1. Empresa identificada (+15)
  if (input.company && input.company.trim().length > 1) {
    score += 15;
  }

  // 2. URL de candidatura válida (+20)
  if (input.applyUrl && input.applyUrl.startsWith("http")) {
    score += 20;
  }

  // 3. Descrição disponível (+15 básico, +25 completo)
  const descLen = (input.description ?? "").trim().length;
  if (descLen > 500) {
    score += 25;
  } else if (descLen > 100) {
    score += 15;
  }

  // 4. Modalidade identificada (+15)
  if (input.remoteType !== "unknown") {
    score += 15;
  }

  // 5. Senioridade identificada (+10)
  if (input.seniority !== "unknown") {
    score += 10;
  }

  // 6. Tecnologias detectadas (+10)
  if (input.technologiesCount > 0) {
    score += 10;
  }

  // 7. Salário informado (+5)
  if (input.hasSalary) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}
