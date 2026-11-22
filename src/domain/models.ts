export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

export type SeniorityLevel =
  "intern" | "junior" | "mid" | "senior" | "staff" | "unknown";

export type JobStatus = "active" | "inactive" | "unknown";

export type PublicationStatus =
  "PENDING" | "SENDING" | "SENT" | "RETRY" | "FAILED" | "SKIPPED";

export interface InferredData {
  seniorityEvidence?: string;
  seniorityConfidence?: number;
  remoteEvidence?: string;
  remoteConfidence?: number;
  regionEvidence?: string;
  usdEvidence?: string;
}

export interface NormalizedJob {
  id: string; // provider_providerJobId determinístico
  provider: string; // greenhouse, lever, ashby
  providerJobId: string;
  company: string;
  title: string;
  description: string;
  location: string | null;

  remoteType: RemoteType;
  seniority: SeniorityLevel;
  technologies: string[];

  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;

  country: string | null;
  eligibleRegions: string[];

  employmentType: string | null;

  applyUrl: string;
  sourceUrl: string;

  canonicalHash: string;
  qualityScore: number;
  inferredData: InferredData;

  publishedAt: string | null;
  discoveredAt: string;
  lastSeenAt: string;

  status: JobStatus;
  isHistorical?: boolean;
}

export interface SourceConfig {
  id: string;
  name: string;
  provider: "greenhouse" | "lever" | "ashby";
  identifier: string;
  baseUrl: string;
  enabled: boolean;
}

export interface JobProvider {
  name: string;
  collect(source: SourceConfig): Promise<NormalizedJob[]>;
}

export interface DiscordChannelConfig {
  id: string;
  name: string;
  category: "seniority" | "region" | "compensation";
  description?: string;
  envKey: string;
  color: number;
  enabled?: boolean;
}

export interface PublicationRecord {
  id?: number;
  jobId: string;
  channelId: string;
  status: PublicationStatus;
  attemptsCount: number;
  discordMessageId?: string | null;
  lastError?: string | null;
  scheduledAt?: Date;
  publishedAt?: Date | null;
}

export interface CollectionRunResult {
  provider: string;
  sourceIdentifier: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  durationMs: number;
  totalReceived: number;
  totalNew: number;
  totalDuplicates: number;
  errorMessage?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  url: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
  author?: {
    name: string;
    url?: string;
  };
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
  allowed_mentions: {
    parse: string[];
    users?: string[];
    roles?: string[];
  };
}
