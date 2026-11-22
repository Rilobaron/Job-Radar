import type { SeniorityLevel } from "../domain/models.js";

export interface SeniorityClassification {
  level: SeniorityLevel;
  confidence: number;
  evidence: string;
}

// Padrões de falsos positivos na descrição que NÃO representam a senioridade da vaga
const FALSE_POSITIVE_CONTEXTS = [
  /reporting\s+to\s+(?:a\s+)?senior/i,
  /report\s+to\s+(?:a\s+)?senior/i,
  /mentored\s+by\s+(?:a\s+)?senior/i,
  /work\s+with\s+senior/i,
  /learn\s+from\s+senior/i,
  /collaborate\s+with\s+senior/i,
  /under\s+the\s+guidance\s+of\s+(?:a\s+)?senior/i,
  /supervising\s+junior/i,
  /mentor\s+junior/i,
  /coaching\s+junior/i,
  /lead\s+by\s+example/i, // "lead by example" não significa que o cargo é Tech Lead
];

// Padrões por nível no TÍTULO (alta prioridade e confiança)
const TITLE_PATTERNS: Array<{
  level: SeniorityLevel;
  pattern: RegExp;
  confidence: number;
}> = [
  // Staff / Principal / Lead
  {
    level: "staff",
    pattern:
      /\b(?:staff|principal|lead|tech\s*lead|líder\s*t[ée]cnico|architect|arquiteto)\b/i,
    confidence: 0.95,
  },
  // Senior
  {
    level: "senior",
    pattern:
      /\b(?:senior|s[êe]nior|sr\.?|sr\b|especialista|specialist|expert)\b/i,
    confidence: 0.95,
  },
  // Mid / Pleno
  {
    level: "mid",
    pattern: /\b(?:pleno|pl\.?|pl\b|mid(?:\s*-\s*level)?|intermediate)\b/i,
    confidence: 0.9,
  },
  // Junior
  {
    level: "junior",
    pattern:
      /\b(?:junior|j[úu]nior|jr\.?|jr\b|entry\s*level|associate|iniciante)\b/i,
    confidence: 0.95,
  },
  // Intern / Trainee
  {
    level: "intern",
    pattern: /\b(?:intern(?:ship)?|est[áa]gi[ao]|estagi[áa]ri[ao]|trainee)\b/i,
    confidence: 0.98,
  },
];

// Padrões na DESCRIÇÃO (usados somente se o título for neutro, com menor confiança)
const BODY_PATTERNS: Array<{
  level: SeniorityLevel;
  pattern: RegExp;
  confidence: number;
}> = [
  {
    level: "intern",
    pattern:
      /\b(?:programa\s+de\s+est[áa]gio|vaga\s+de\s+est[áa]gio|internship\s+program|summer\s+intern)\b/i,
    confidence: 0.85,
  },
  {
    level: "junior",
    pattern:
      /\b(?:procuramos\s+(?:um\s+)?(?:desenvolvedor|engenheiro)\s+j[úu]nior|seeking\s+(?:a\s+)?junior\s+(?:developer|engineer))\b/i,
    confidence: 0.8,
  },
  {
    level: "mid",
    pattern:
      /\b(?:procuramos\s+(?:um\s+)?(?:desenvolvedor|engenheiro)\s+pleno|seeking\s+(?:a\s+)?mid-level\s+(?:developer|engineer))\b/i,
    confidence: 0.8,
  },
  {
    level: "senior",
    pattern:
      /\b(?:procuramos\s+(?:um\s+)?(?:desenvolvedor|engenheiro)\s+s[êe]nior|seeking\s+(?:a\s+)?senior\s+(?:developer|engineer))\b/i,
    confidence: 0.8,
  },
  {
    level: "staff",
    pattern:
      /\b(?:procuramos\s+(?:um\s+)?(?:tech\s+lead|principal\s+engineer)|seeking\s+(?:a\s+)?(?:staff|principal)\s+engineer)\b/i,
    confidence: 0.85,
  },
];

export function classifySeniority(
  title: string,
  description: string = "",
): SeniorityClassification {
  // 1. Tenta identificar diretamente no título da vaga
  for (const item of TITLE_PATTERNS) {
    const match = title.match(item.pattern);
    if (match) {
      return {
        level: item.level,
        confidence: item.confidence,
        evidence: `Título contém termo correspondente: "${match[0]}"`,
      };
    }
  }

  // 2. Se o título não definiu, analisa a descrição evitando contextos de falsos positivos
  // Remove menções de falso positivo antes de checar a descrição
  let sanitizedDesc = description;
  for (const fp of FALSE_POSITIVE_CONTEXTS) {
    sanitizedDesc = sanitizedDesc.replace(fp, " ");
  }

  for (const item of BODY_PATTERNS) {
    const match = sanitizedDesc.match(item.pattern);
    if (match) {
      return {
        level: item.level,
        confidence: item.confidence,
        evidence: `Descrição contém padrão de contexto: "${match[0]}"`,
      };
    }
  }

  return {
    level: "unknown",
    confidence: 0,
    evidence:
      "Nenhum marcador explícito de senioridade identificado no título ou contexto confiável",
  };
}
