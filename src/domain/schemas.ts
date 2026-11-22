import { z } from "zod";

export const remoteTypeSchema = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);
export const seniorityLevelSchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "unknown",
]);
export const jobStatusSchema = z.enum(["active", "inactive", "unknown"]);

export const normalizedJobSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  providerJobId: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  location: z.string().nullable().default(null),

  remoteType: remoteTypeSchema.default("unknown"),
  seniority: seniorityLevelSchema.default("unknown"),
  technologies: z.array(z.string()).default([]),

  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  currency: z.string().nullable().default(null),

  country: z.string().nullable().default(null),
  eligibleRegions: z.array(z.string()).default([]),

  employmentType: z.string().nullable().default(null),

  applyUrl: z.string().url(),
  sourceUrl: z.string().url(),

  canonicalHash: z.string().min(1),
  qualityScore: z.number().min(0).max(100).default(0),
  inferredData: z.record(z.string(), z.unknown()).default({}),

  publishedAt: z.string().nullable().default(null),
  discoveredAt: z.string(),
  lastSeenAt: z.string(),

  status: jobStatusSchema.default("active"),
  isHistorical: z.boolean().default(false),
});

export const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.enum(["greenhouse", "lever", "ashby"]),
  identifier: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
});

// Schemas das respostas das APIs externas

export const greenhouseJobSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((val) => String(val)),
  title: z.string(),
  absolute_url: z.string(),
  location: z
    .object({
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  content: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  first_published: z.string().nullable().optional(),
  departments: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]).nullable().optional(),
        name: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  offices: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]).nullable().optional(),
        name: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

export const greenhouseResponseSchema = z.object({
  jobs: z.array(greenhouseJobSchema),
});

export const leverPostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().optional(),
  createdAt: z.number().optional(),
  descriptionPlain: z.string().optional(),
  description: z.string().optional(),
  workplaceType: z.string().optional(),
  country: z.string().nullable().optional(),
  categories: z
    .object({
      location: z.string().nullable().optional(),
      commitment: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      allLocations: z.array(z.string()).optional(),
    })
    .optional(),
});

export const leverResponseSchema = z.array(leverPostingSchema);

export const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  publishedAt: z.string().nullable().optional(),
  isListed: z.boolean().optional(),
  isRemote: z.boolean().optional(),
  workplaceType: z.string().optional(),
  jobUrl: z.string().optional(),
  applyUrl: z.string().optional(),
  descriptionPlain: z.string().optional(),
  descriptionHtml: z.string().optional(),
  location: z.string().nullable().optional(),
  secondaryLocations: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .nullable()
    .optional(),
  employmentType: z.string().nullable().optional(),
  address: z
    .object({
      postalAddress: z
        .object({
          addressCountry: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  compensation: z
    .object({
      summary: z.string().optional(),
      currencyCode: z.string().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
    })
    .optional(),
});

export const ashbyResponseSchema = z.object({
  jobs: z.array(ashbyJobSchema),
});
