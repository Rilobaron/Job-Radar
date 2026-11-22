import { TECHNOLOGIES } from "../config/constants.js";

export interface TechnologyDetection {
  technologies: string[];
  evidence: Record<string, string>;
}

export function detectTechnologies(
  title: string,
  description: string = "",
): TechnologyDetection {
  const combinedText = `${title}\n${description}`;
  const detected = new Set<string>();
  const evidence: Record<string, string> = {};

  for (const tech of TECHNOLOGIES) {
    for (const pattern of tech.patterns) {
      const match = combinedText.match(pattern);
      if (match) {
        detected.add(tech.name);
        evidence[tech.name] = `Padrão encontrado: "${match[0]}"`;
        break;
      }
    }
  }

  // Regras de refinamento:
  // Se detectou React Native, não necessariamente precisamos remover React, mas se o usuário especificar React Native sabemos que é mobile.
  // Se detectou TypeScript, manter independente de JavaScript.
  return {
    technologies: Array.from(detected).sort(),
    evidence,
  };
}
