-- =============================================================================
-- Migration 001: Initial Schema - JobRadar v1.0
-- Suporta PostgreSQL 14+ e Supabase (com RLS e índices otimizados)
-- =============================================================================

-- Extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela: sources (fontes de vagas cadastradas)
CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- greenhouse, lever, ashby
    identifier VARCHAR(150) NOT NULL, -- slug/token da empresa no provedor
    base_url VARCHAR(500) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sources_provider_identifier UNIQUE (provider, identifier)
);

CREATE INDEX IF NOT EXISTS idx_sources_provider_enabled ON sources(provider, enabled);

-- 2. Tabela: jobs (vagas normalizadas)
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(150) PRIMARY KEY, -- id único determinístico ou uuid
    provider VARCHAR(50) NOT NULL,
    provider_job_id VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location VARCHAR(500),
    remote_type VARCHAR(20) NOT NULL DEFAULT 'unknown', -- remote, hybrid, onsite, unknown
    seniority VARCHAR(20) NOT NULL DEFAULT 'unknown', -- intern, junior, mid, senior, staff, unknown
    salary_min NUMERIC(12, 2),
    salary_max NUMERIC(12, 2),
    currency VARCHAR(10),
    country VARCHAR(100),
    eligible_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
    employment_type VARCHAR(100),
    apply_url VARCHAR(1000) NOT NULL,
    source_url VARCHAR(1000) NOT NULL,
    canonical_hash VARCHAR(64) NOT NULL, -- hash de deduplicação (company + title normalizado)
    quality_score INTEGER NOT NULL DEFAULT 0,
    inferred_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- metadados de inferência e confiança
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, unknown
    is_historical BOOLEAN NOT NULL DEFAULT false, -- flag de bootstrap para não floodar
    published_at TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_jobs_provider_job_id UNIQUE (provider, provider_job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_canonical_hash ON jobs(canonical_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type ON jobs(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_seniority ON jobs(seniority);
CREATE INDEX IF NOT EXISTS idx_jobs_published_at ON jobs(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_is_historical ON jobs(is_historical);

-- 3. Tabela: job_tags (tags de tecnologia e categorização)
CREATE TABLE IF NOT EXISTS job_tags (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(150) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    tag_type VARCHAR(50) NOT NULL, -- technology, category, seniority_evidence
    tag_name VARCHAR(100) NOT NULL,
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_tags_job_type_name UNIQUE (job_id, tag_type, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_job_tags_job_id ON job_tags(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tags_tag_name ON job_tags(tag_name);

-- 4. Tabela: discord_channels (canais de destino no Discord)
-- Segurança: Não armazena o token/url completa do webhook em texto puro no banco.
-- Armazena o identificador e a chave de variável de ambiente (env_key) correspondente.
CREATE TABLE IF NOT EXISTS discord_channels (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL, -- seniority, region, compensation
    description VARCHAR(255),
    env_key VARCHAR(100) NOT NULL, -- ex: DISCORD_WEBHOOK_JUNIOR
    color INTEGER NOT NULL DEFAULT 5814783,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabela: publications (fila e histórico de publicações de vagas nos canais)
CREATE TABLE IF NOT EXISTS publications (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(150) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    channel_id VARCHAR(100) NOT NULL REFERENCES discord_channels(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SENDING, SENT, RETRY, FAILED, SKIPPED
    attempts_count INTEGER NOT NULL DEFAULT 0,
    discord_message_id VARCHAR(100),
    last_error TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_publications_job_channel UNIQUE (job_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_publications_status_scheduled ON publications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publications_channel_status ON publications(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_publications_job_id ON publications(job_id);

-- 6. Tabela: collection_runs (observabilidade de ciclos de coleta)
CREATE TABLE IF NOT EXISTS collection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    source_identifier VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL, -- SUCCESS, PARTIAL, FAILED
    duration_ms INTEGER NOT NULL,
    total_received INTEGER NOT NULL DEFAULT 0,
    total_new INTEGER NOT NULL DEFAULT 0,
    total_duplicates INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_started ON collection_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_runs_provider ON collection_runs(provider);

-- 7. Tabela: publication_attempts (auditoria detalhada de cada disparo Discord)
CREATE TABLE IF NOT EXISTS publication_attempts (
    id BIGSERIAL PRIMARY KEY,
    publication_id BIGINT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    duration_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publication_attempts_pub_id ON publication_attempts(publication_id);
