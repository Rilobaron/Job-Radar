-- =============================================================================
-- Migration 002: Security Policies & RLS - JobRadar v1.0
-- Protege as tabelas contra acesso público no Supabase e Postgres
-- =============================================================================

-- Cria roles anon, authenticated e service_role se não existirem (compatibilidade universal com Postgres local/Docker)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END $$;

-- Habilita RLS em todas as tabelas operacionais
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_attempts ENABLE ROW LEVEL SECURITY;

-- Garante que 'anon' e 'authenticated' (chaves públicas do Supabase) NÃO tenham acesso às tabelas
REVOKE ALL ON sources FROM anon, authenticated;
REVOKE ALL ON jobs FROM anon, authenticated;
REVOKE ALL ON job_tags FROM anon, authenticated;
REVOKE ALL ON discord_channels FROM anon, authenticated;
REVOKE ALL ON publications FROM anon, authenticated;
REVOKE ALL ON collection_runs FROM anon, authenticated;
REVOKE ALL ON publication_attempts FROM anon, authenticated;

-- Políticas explícitas para service_role (usado pelo backend do JobRadar)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_sources') THEN
        CREATE POLICY service_role_all_sources ON sources FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_jobs') THEN
        CREATE POLICY service_role_all_jobs ON jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_job_tags') THEN
        CREATE POLICY service_role_all_job_tags ON job_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_discord_channels') THEN
        CREATE POLICY service_role_all_discord_channels ON discord_channels FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_publications') THEN
        CREATE POLICY service_role_all_publications ON publications FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_collection_runs') THEN
        CREATE POLICY service_role_all_collection_runs ON collection_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_publication_attempts') THEN
        CREATE POLICY service_role_all_publication_attempts ON publication_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
