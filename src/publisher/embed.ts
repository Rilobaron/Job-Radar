import { DISCORD_LIMITS } from "../config/constants.js";
import type {
  NormalizedJob,
  DiscordEmbed,
  DiscordWebhookPayload,
  DiscordChannelConfig,
} from "../domain/models.js";

// Sanitiza strings para evitar injeção de mentions no Discord e quebras de formatação
export function sanitizeDiscordText(text: string): string {
  if (!text) return "";
  return text
    .replace(/@everyone/g, "@\u200beveryone")
    .replace(/@here/g, "@\u200bhere")
    .replace(/<@&?\d+>/g, "") // remove menções de cargos e IDs
    .trim();
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function formatSeniorityLabel(
  seniority: NormalizedJob["seniority"],
): string {
  const map: Record<NormalizedJob["seniority"], string> = {
    intern: "Estágio / Trainee",
    junior: "Júnior",
    mid: "Pleno",
    senior: "Sênior",
    staff: "Staff / Principal / Lead",
    unknown: "Não especificado",
  };
  return map[seniority] || seniority;
}

export function formatRemoteLabel(
  remoteType: NormalizedJob["remoteType"],
): string {
  const map: Record<NormalizedJob["remoteType"], string> = {
    remote: "🌐 100% Remoto",
    hybrid: "🏢 Híbrido",
    onsite: "📍 Presencial",
    unknown: "Não especificado",
  };
  return map[remoteType] || remoteType;
}

export function buildJobEmbed(
  job: NormalizedJob,
  channel?: DiscordChannelConfig,
): DiscordWebhookPayload {
  const sanitizedTitle = sanitizeDiscordText(job.title);
  const sanitizedCompany = sanitizeDiscordText(job.company);

  const title = truncateText(
    `${sanitizedTitle} @ ${sanitizedCompany}`,
    DISCORD_LIMITS.TITLE_MAX_LENGTH,
  );

  const fields: DiscordEmbed["fields"] = [
    {
      name: "🏢 Empresa",
      value: truncateText(
        sanitizedCompany,
        DISCORD_LIMITS.FIELD_VALUE_MAX_LENGTH,
      ),
      inline: true,
    },
    {
      name: "💼 Nível",
      value: formatSeniorityLabel(job.seniority),
      inline: true,
    },
    {
      name: "🌍 Modalidade",
      value: formatRemoteLabel(job.remoteType),
      inline: true,
    },
  ];

  if (job.location) {
    fields.push({
      name: "📍 Localização",
      value: truncateText(
        sanitizeDiscordText(job.location),
        DISCORD_LIMITS.FIELD_VALUE_MAX_LENGTH,
      ),
      inline: true,
    });
  }

  // Salário (se houver)
  if (job.salaryMin !== null || job.salaryMax !== null || job.currency) {
    let salaryText = "";
    if (job.salaryMin && job.salaryMax) {
      salaryText = `${job.currency ?? ""} ${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}`;
    } else if (job.salaryMin) {
      salaryText = `A partir de ${job.currency ?? ""} ${job.salaryMin.toLocaleString()}`;
    } else if (job.salaryMax) {
      salaryText = `Até ${job.currency ?? ""} ${job.salaryMax.toLocaleString()}`;
    } else if (job.currency) {
      salaryText = `Moeda: ${job.currency}`;
    }

    if (salaryText) {
      fields.push({
        name: "💰 Remuneração",
        value: truncateText(
          salaryText.trim(),
          DISCORD_LIMITS.FIELD_VALUE_MAX_LENGTH,
        ),
        inline: true,
      });
    }
  }

  // Tecnologias detectadas
  if (job.technologies.length > 0) {
    const techBadges = job.technologies.map((t) => `\`${t}\``).join(" ");
    fields.push({
      name: "🛠️ Tecnologias",
      value: truncateText(techBadges, DISCORD_LIMITS.FIELD_VALUE_MAX_LENGTH),
      inline: false,
    });
  }

  // Botão/Link de candidatura oficial
  fields.push({
    name: "🚀 Candidatura Oficial",
    value: `[Clique aqui para se candidatar na vaga original](${job.applyUrl})`,
    inline: false,
  });

  const embedColor = channel?.color ?? 3447003; // Cor padrão azul Discord

  const embed: DiscordEmbed = {
    title,
    url: job.applyUrl,
    color: embedColor,
    fields,
    footer: {
      text: `JobRadar v1.0 • Fonte: ${job.provider.toUpperCase()} • Score de integridade: ${job.qualityScore}/100`,
    },
    timestamp: job.publishedAt || job.discoveredAt,
  };

  return {
    embeds: [embed],
    allowed_mentions: {
      parse: [], // Bloqueia todas as menções de usuários, cargos e @everyone
    },
  };
}
