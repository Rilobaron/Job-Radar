import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),

  DISCORD_WEBHOOK_DEFAULT: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_INTERN: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_JUNIOR: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_MID: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_SENIOR: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_BRAZIL_REMOTE: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_INTERNATIONAL: z.string().url().optional().or(z.literal("")),
  DISCORD_WEBHOOK_USD: z.string().url().optional().or(z.literal("")),

  DRY_RUN: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .default(false),

  PUBLICATION_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .default(false),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  MAX_PUBLICATIONS_PER_RUN: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 5))
    .default(5),

  MAX_PUBLICATIONS_DAILY: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .default(50),

  REQUEST_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10000))
    .default(10000),

  MAX_RETRIES: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 3))
    .default(3),

  BOOTSTRAP_MARK_AS_HISTORICAL: z
    .string()
    .optional()
    .transform((val) => val === undefined || val === "true" || val === "1")
    .default(true),
});

export type EnvConfig = z.infer<typeof envSchema>;

let parsedEnv: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!parsedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formattedErrors = result.error.format();
      console.error(
        "[FATAL] Configuração de variáveis de ambiente inválida:",
        JSON.stringify(formattedErrors, null, 2),
      );
      throw new Error(
        "Variáveis de ambiente inválidas. Verifique o arquivo .env ou o ambiente.",
      );
    }
    parsedEnv = result.data;
  }
  return parsedEnv;
}

export function resetEnvCache(): void {
  parsedEnv = null;
}
