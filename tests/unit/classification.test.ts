import { describe, it, expect } from "vitest";
import { classifySeniority } from "../../src/classification/seniority.js";
import { detectTechnologies } from "../../src/classification/technology.js";
import { classifyWorkMode } from "../../src/classification/work-mode.js";
import { classifyLocation } from "../../src/classification/location.js";
import { calculateQualityScore } from "../../src/classification/quality.js";
import { generateCanonicalHash } from "../../src/classification/engine.js";

describe("Classification Engine", () => {
  describe("Seniority Classification", () => {
    it("deve identificar níveis no título com alta precisão", () => {
      expect(classifySeniority("Estágio em Desenvolvimento Web").level).toBe(
        "intern",
      );
      expect(classifySeniority("Trainee de Engenharia").level).toBe("intern");
      expect(classifySeniority("Desenvolvedor Júnior").level).toBe("junior");
      expect(classifySeniority("Junior Frontend Engineer").level).toBe(
        "junior",
      );
      expect(classifySeniority("Engenheiro de Software Pleno").level).toBe(
        "mid",
      );
      expect(classifySeniority("Mid-Level Backend Developer").level).toBe(
        "mid",
      );
      expect(classifySeniority("Senior Fullstack Engineer").level).toBe(
        "senior",
      );
      expect(classifySeniority("Desenvolvedor Sênior").level).toBe("senior");
      expect(classifySeniority("Staff Software Engineer").level).toBe("staff");
      expect(classifySeniority("Tech Lead / Líder Técnico").level).toBe(
        "staff",
      );
      expect(classifySeniority("Principal Architect").level).toBe("staff");
    });

    it("deve evitar falsos positivos comuns na descrição", () => {
      // Vaga junior com menção a senior mentorando NÃO deve ser sênior
      const title = "Software Engineer";
      const desc =
        "You will be mentored by a senior engineer and report to a senior team lead.";
      const result = classifySeniority(title, desc);
      expect(result.level).not.toBe("senior");
      expect(result.level).not.toBe("staff");
    });

    it("deve evitar falso positivo de 'lead by example'", () => {
      const title = "Software Engineer";
      const desc =
        "We expect developers to lead by example and collaborate well.";
      const result = classifySeniority(title, desc);
      expect(result.level).toBe("unknown");
    });

    it("deve retornar unknown quando não há marcadores", () => {
      const result = classifySeniority(
        "Software Developer",
        "Write clean code.",
      );
      expect(result.level).toBe("unknown");
      expect(result.confidence).toBe(0);
    });
  });

  describe("Technology Detection", () => {
    it("deve detectar tecnologias comuns com precisão", () => {
      const text =
        "Looking for a TypeScript and React engineer with Node.js and PostgreSQL.";
      const { technologies } = detectTechnologies(text);
      expect(technologies).toContain("TypeScript");
      expect(technologies).toContain("React");
      expect(technologies).toContain("Node.js");
      expect(technologies).toContain("PostgreSQL");
    });

    it("não deve confundir Java com JavaScript", () => {
      const text1 =
        "We need an experienced Java backend engineer using Spring.";
      const res1 = detectTechnologies(text1);
      expect(res1.technologies).toContain("Java");
      expect(res1.technologies).not.toContain("JavaScript");

      const text2 = "We need a JavaScript frontend developer.";
      const res2 = detectTechnologies(text2);
      expect(res2.technologies).toContain("JavaScript");
      expect(res2.technologies).not.toContain("Java");
    });

    it("deve detectar Go e Rust sem falsos positivos em palavras comuns", () => {
      const positive = "Backend developer proficient in Go and Rust.";
      const resPos = detectTechnologies(positive);
      expect(resPos.technologies).toContain("Go");
      expect(resPos.technologies).toContain("Rust");

      const falsePos =
        "We trust our employees to go ahead with creative ideas.";
      const resFalse = detectTechnologies(falsePos);
      expect(resFalse.technologies).not.toContain("Rust");
      // "go ahead" não deve casar
      expect(resFalse.technologies).not.toContain("Go");
    });
  });

  describe("Work Mode Classification", () => {
    it("deve priorizar metadados explícitos do provedor", () => {
      const res = classifyWorkMode("remote", "Software Engineer", "New York");
      expect(res.remoteType).toBe("remote");
      expect(res.confidence).toBeGreaterThan(0.9);
    });

    it("deve detectar trabalho híbrido e presencial", () => {
      expect(
        classifyWorkMode(null, "Engenheiro Híbrido", "São Paulo").remoteType,
      ).toBe("hybrid");
      expect(
        classifyWorkMode(null, "Dev Presencial", "Rio de Janeiro").remoteType,
      ).toBe("onsite");
    });

    it("não deve considerar remoto termos falsos como 'remote sensing'", () => {
      const res = classifyWorkMode(
        null,
        "Researcher in Remote Sensing",
        "London",
      );
      expect(res.remoteType).not.toBe("remote");
    });
  });

  describe("Location & USD Eligibility", () => {
    it("deve identificar vagas no Brasil e Brasil Remoto", () => {
      const res = classifyLocation(
        "São Paulo, Brazil",
        "Empresa brasileira",
        "remote",
      );
      expect(res.isBrazil).toBe(true);
      expect(res.isBrazilRemote).toBe(true);
      expect(res.country).toBe("Brazil");
    });

    it("deve exigir evidência explícita para vagas em dólar", () => {
      const semDolar = classifyLocation(
        "Remote",
        "Vaga internacional sem menção salarial",
        "remote",
      );
      expect(semDolar.isUsdSalary).toBe(false);

      const comDolar = classifyLocation(
        "Remote",
        "Salary: $150,000 USD per year",
        "remote",
      );
      expect(comDolar.isUsdSalary).toBe(true);
      expect(comDolar.usdEvidence).toBeDefined();
    });

    it("não deve considerar R$ como dólar", () => {
      const res = classifyLocation(
        "Brasil",
        "Salário oferecido: R$ 15.000 por mês",
        "remote",
      );
      expect(res.isUsdSalary).toBe(false);
    });

    it("não deve classificar vaga remota nos EUA como disponível para o Brasil ou Internacional aberta", () => {
      const resUs = classifyLocation(
        "Remote, United States",
        "Must be authorized to work in the US. No international relocation.",
        "remote",
      );
      expect(resUs.isBrazil).toBe(false);
      expect(resUs.isBrazilRemote).toBe(false);
      expect(resUs.isInternational).toBe(false);
      expect(resUs.eligibleRegions).not.toContain("Brazil");
      expect(resUs.eligibleRegions).not.toContain("International");
    });

    it("não deve confundir cidades como Bristol ou Bridgeport com Brasil por causa de 'BR'", () => {
      const resBristol = classifyLocation(
        "Bristol, United Kingdom",
        "Join our office in the UK.",
        "onsite",
      );
      expect(resBristol.isBrazil).toBe(false);
      expect(resBristol.isBrazilRemote).toBe(false);
    });

    it("deve rejeitar remuneração em Euro ou Libra como vaga em dólar", () => {
      const resEuro = classifyLocation(
        "Berlin, Germany",
        "Competitive compensation: €80,000 per year.",
        "remote",
        "EUR",
      );
      expect(resEuro.isUsdSalary).toBe(false);
    });

    it("deve permitir Brasil Remoto para vagas 100% Anywhere / Worldwide sem restrição externa", () => {
      const resGlobal = classifyLocation(
        "Anywhere in the World",
        "We are a fully distributed worldwide remote company.",
        "remote",
      );
      expect(resGlobal.isBrazilRemote).toBe(true);
    });
  });

  describe("Quality Score Calculation", () => {
    it("deve pontuar alto vagas completas e confiáveis", () => {
      const score = calculateQualityScore({
        company: "GitLab",
        applyUrl: "https://gitlab.com/jobs/1",
        description: "A".repeat(600),
        remoteType: "remote",
        seniority: "senior",
        technologiesCount: 3,
        hasSalary: true,
        publishedAt: "2026-01-01",
      });
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it("deve pontuar baixo vagas incompletas", () => {
      const score = calculateQualityScore({
        company: "",
        applyUrl: "",
        description: "",
        remoteType: "unknown",
        seniority: "unknown",
        technologiesCount: 0,
        hasSalary: false,
        publishedAt: null,
      });
      expect(score).toBe(0);
    });
  });

  describe("Canonical Hash Deduplication", () => {
    it("deve gerar o mesmo hash para títulos com pequenas variações de acento e espaço", () => {
      const hash1 = generateCanonicalHash(
        "Empresa Tech",
        "Desenvolvedor Sênior - Fullstack",
      );
      const hash2 = generateCanonicalHash(
        "Empresa Tech",
        "desenvolvedor senior fullstack",
      );
      expect(hash1).toBe(hash2);
    });

    it("deve gerar hashes distintos para empresas ou cargos diferentes", () => {
      const hash1 = generateCanonicalHash("Google", "Software Engineer");
      const hash2 = generateCanonicalHash("Amazon", "Software Engineer");
      expect(hash1).not.toBe(hash2);
    });
  });
});
