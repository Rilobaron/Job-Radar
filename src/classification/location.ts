export interface LocationClassification {
  country: string | null;
  eligibleRegions: string[];
  isBrazil: boolean;
  isBrazilRemote: boolean;
  isLatam: boolean;
  isInternational: boolean;
  isUsdSalary: boolean;
  usdEvidence?: string;
}

// Regex com boundary estrito para evitar falsos positivos como Bristol, Bridgeport, Brno, etc.
const BRAZIL_PATTERNS = [
  /\bbrasil\b/i,
  /\bbrazil\b/i,
  /\b(?:br|bra)\b/i,
  /\bs[ãa]o\s+paulo\b/i,
  /\brio\s+de\s+janeiro\b/i,
  /\bcuritiba\b/i,
  /\bflorian[óo]polis\b/i,
  /\bporto\s+alegre\b/i,
  /\bbelo\s+horizonte\b/i,
  /\brecife\b/i,
  /\bsalvador\b/i,
  /\bbras[íi]lia\b/i,
  /\bcampinas\b/i,
];

const LATAM_PATTERNS = [
  /\blatam\b/i,
  /\blatin\s+america\b/i,
  /\bam[ée]rica\s+latina\b/i,
  /\bargentina\b/i,
  /\bcolombia\b/i,
  /\bm[ée]xico\b/i,
  /\bmexico\b/i,
  /\bchile\b/i,
  /\buruguay\b/i,
];

// Padrões de restrição regional externa estrita (vagas remotas restritas a outros países)
const REGIONAL_RESTRICTION_PATTERNS = [
  /\b(?:united states|usa?|u\.s\.a?|north america)\s+(?:only|citizens?|based|residents?)\b/i,
  /\b(?:us|usa)\s+(?:only|citizens?|based|residents?)\b/i,
  /\bmust\s+reside\s+in\s+(?:the\s+)?(?:us|united states|uk|canada|europe|germany|france)\b/i,
  /\b(?:emea|apac|europe|uk|canada|australia)\s+only\b/i,
  /\b(?:uk|canada|germany|france|netherlands|spain|ireland)\s+residents?\b/i,
  /\bno\s+international\s+(?:relocation|applicants?|hiring)\b/i,
  /\bauthorized\s+to\s+work\s+in\s+(?:the\s+)?(?:us|united states|uk|canada)\s+without\s+sponsorship\b/i,
];

const GLOBAL_REMOTE_PATTERNS = [
  /\b(?:anywhere|global|worldwide|all\s+regions|work\s+from\s+anywhere|remote\s*-\s*global|remote\s*-\s*worldwide)\b/i,
];

const USD_PATTERNS = [
  /\b(?:usd|u\.s\.d\.)\b/i,
  /\b(?:d[óo]lar(?:es)?|dollars?)\b/i,
  /\bus\s*\$\s*\d{1,3}(?:[.,]\d{3})*(?:\s*(?:k|thousand|\/year|\/yr|\/mo|\/month|\/m[êe]s|ano))?/i,
  /\bu\$s\s*\d{1,3}(?:[.,]\d{3})*/i,
  /(?<![RrCcAaNnZzHh][A-Za-z]?\s*)\$\s*\d{1,3}(?:[.,]\d{3})*(?:\s*(?:k|thousand|\/year|\/yr|\/mo|\/month|\/m[êe]s|ano))?/i,
  /\b\d{1,3}(?:[.,]\d{3})*\s*(?:usd|dollars?)\b/i,
];

export function classifyLocation(
  rawLocation: string | null = "",
  description: string = "",
  remoteType: string = "unknown",
  currency: string | null = null,
): LocationClassification {
  const loc = (rawLocation ?? "").trim();
  const combined = `${loc}\n${description}`;

  // 1. Checa Brasil usando boundary estrito
  let isBrazil = false;
  for (const p of BRAZIL_PATTERNS) {
    if (p.test(loc)) {
      isBrazil = true;
      break;
    }
  }

  // 2. Checa LATAM
  let isLatam = false;
  for (const p of LATAM_PATTERNS) {
    if (p.test(loc) || p.test(description)) {
      isLatam = true;
      break;
    }
  }

  // 3. Checa se há restrição regional externa explícita (ex: "US Only", "Remote - US")
  let hasForeignRegionalRestriction = false;
  for (const p of REGIONAL_RESTRICTION_PATTERNS) {
    if (p.test(combined)) {
      hasForeignRegionalRestriction = true;
      break;
    }
  }

  // Se a localização for algo como "Remote, United States" ou "Remote - US" ou "San Francisco, CA"
  // sem menção de LATAM ou Brasil, consideramos como restrição regional dos EUA
  const isUsExplicitLocation =
    /\b(?:united states|usa?|u\.s\.a?|north america)\b/i.test(loc) ||
    /\b(?:california|new york|texas|washington|florida|massachusetts)\b/i.test(
      loc,
    );

  if (isUsExplicitLocation && !isBrazil && !isLatam) {
    hasForeignRegionalRestriction = true;
  }

  // 4. Checa se é Remoto Global (Anywhere / Worldwide / Global)
  let isGlobalRemote = false;
  if (remoteType === "remote") {
    for (const p of GLOBAL_REMOTE_PATTERNS) {
      if (p.test(loc) || p.test(description)) {
        isGlobalRemote = true;
        break;
      }
    }
  }

  // 5. Brasil Remoto:
  // Vaga remota no Brasil, ou LATAM, ou Global/Worldwide desde que NÃO tenha restrição externa explícita
  let isBrazilRemote = false;
  if (remoteType === "remote") {
    if (isBrazil || isLatam) {
      isBrazilRemote = true;
    } else if (isGlobalRemote && !hasForeignRegionalRestriction) {
      isBrazilRemote = true;
    }
  }

  // 6. Internacional aberta:
  // Vagas remotas internacionais abertas para o público global/brasileiro:
  // DEVE ser remota, NÃO possuir restrições regionais exclusivas de outros países (ex: US Only, UK Only)
  // e ser explicitamente Global/Worldwide, LATAM, ou sem restrição territorial restritiva.
  let isInternational = false;
  if (remoteType === "remote" && !hasForeignRegionalRestriction) {
    if (isGlobalRemote || isLatam) {
      isInternational = true;
    } else if (!isBrazil && !isUsExplicitLocation) {
      isInternational = true;
    }
  }

  // 7. Vagas em Dólar (USD) - EXIGE evidência explícita comprovada
  let isUsdSalary = false;
  let usdEvidence: string | undefined;

  // Se a moeda declarada for expressamente USD ou $ ou US$
  if (
    currency &&
    (currency.toUpperCase() === "USD" ||
      currency === "$" ||
      currency.toUpperCase() === "US$")
  ) {
    isUsdSalary = true;
    usdEvidence = `Moeda informada no contrato: ${currency}`;
  } else if (
    currency &&
    currency.toUpperCase() !== "USD" &&
    currency !== "$" &&
    currency.toUpperCase() !== "US$"
  ) {
    // Moeda declarada é outra (BRL, EUR, GBP, CAD, etc.) - não considerar USD
    isUsdSalary = false;
  } else {
    const hasExplicitBrl = /\b(?:r\$|brl|reais)\b/i.test(combined);
    for (const p of USD_PATTERNS) {
      const match = combined.match(p);
      if (match) {
        // Se houver menção a R$/BRL no texto, só aceita se o match for especificamente USD ou dólares
        if (
          hasExplicitBrl &&
          !/\b(?:usd|u\.s\.d\.|d[óo]lar|dollars?)\b/i.test(match[0])
        ) {
          continue;
        }
        isUsdSalary = true;
        usdEvidence = `Evidência no texto da vaga: "${match[0]}"`;
        break;
      }
    }
  }

  const eligibleRegions: string[] = [];
  if (isBrazil) eligibleRegions.push("Brazil");
  if (isLatam) eligibleRegions.push("LATAM");
  if (isBrazilRemote && !eligibleRegions.includes("Brazil")) {
    eligibleRegions.push("Brazil");
  }
  if (isInternational) eligibleRegions.push("International");

  return {
    country: isBrazil
      ? "Brazil"
      : isUsExplicitLocation
        ? "United States"
        : null,
    eligibleRegions,
    isBrazil,
    isBrazilRemote,
    isLatam,
    isInternational,
    isUsdSalary,
    usdEvidence,
  };
}
