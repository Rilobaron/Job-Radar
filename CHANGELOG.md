# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.0.1] - 2026-03-03

### Corrigido e Melhorado (Auditoria & Homologação de Produção)
- **Segurança de Publicação**:
  - Implementada a flag de segurança obrigatória `PUBLICATION_ENABLED` (padrão `false`).
  - Sem `PUBLICATION_ENABLED=true` explícito, nenhum disparo real é feito na rede, protegendo contra ativação acidental.
- **Concorrência e Idempotência na Fila**:
  - Substituição da seleção estática por aquisição atômica com lock transacional e reserva (`FOR UPDATE SKIP LOCKED`).
  - Implementado lease timeout de 5 minutos em `publications`: se uma instância cair ou morrer durante o envio, a publicação é automaticamente recuperada para nova tentativa sem perda nem duplicação.
- **Refinamento de Classificação Geográfica e Qualidade**:
  - Eliminado o falso positivo da substring `"BR"` (que casava cidades estrangeiras como Bristol ou Bridgeport).
  - Vagas remotas restritas aos EUA ou outros países (ex: "Remote, US", "US Only", "EMEA only") não são mais marcadas como disponíveis para o Brasil.
  - Vagas com salários declarados em EUR, GBP ou sem evidência deixaram de ser consideradas incorretamente como vagas em dólar.
- **Tolerância Universal em Migrações SQL**:
  - `migrations/002_security_policies.sql` atualizada para criar condicionalmente os roles `anon`, `authenticated` e `service_role`, permitindo execução tanto no Supabase quanto em PostgreSQL nativo/Docker limpo.
  - Criada `migrations/003_queue_concurrency.sql` com índices compostos para otimização de concorrência.
- **Segurança de Dependências**:
  - Resolvidas todas as vulnerabilidades apontadas pelo `npm audit` (0 vulnerabilidades).
- **Testes de Homologação Real**:
  - Adicionada suíte `discord-http-server.test.ts` com servidor HTTP real testando payloads, sanitização, HTTP 204, 200, 429 (`Retry-After`) e timeouts.
  - Adicionada suíte `postgres-real.test.ts` para homologação em instâncias reais de PostgreSQL com concorrência e transações.
  - Adicionada suíte `bootstrap-resilience.test.ts` validando isolamento de estoque histórico.
  - Suíte total expandida para **57 testes automatizados** com 100% de aprovação.

## [1.0.0] - 2026-03-03

### Adicionado
- **Conectores de Coleta Resilientes**:
  - Greenhouse Board API pública (`/v1/boards/{boardToken}/jobs?content=true`).
  - Lever Postings API pública (`/v0/postings/{site}?mode=json`).
  - Ashby Job Board API pública (`/posting-api/job-board/{boardName}`).
  - Catálogo de fontes reais testado com sucesso (GitLab, Canonical, Palantir, Linear, Ramp).
- **Engine Determinístico de Classificação**:
  - Classificação de senioridade em PT/EN (estágio, júnior, pleno, sênior, staff/lead) com prevenção de falsos positivos na descrição.
  - Detecção precisa de tecnologias (TypeScript, React, Node.js, Go, Rust, Python, PostgreSQL, Docker, AWS, etc.).
  - Classificação de modalidade (remoto, híbrido, presencial) com filtros de negação.
  - Classificação geográfica e elegibilidade (Brasil, Brasil Remoto, LATAM, Internacional).
  - Classificação estrita de **Vagas em Dólar (USD)** com exigência de evidência comprovada.
  - Cálculo de pontuação de qualidade (0 a 100).
- **Persistência em PostgreSQL / Supabase**:
  - Migrações versionadas com RLS para proteção de dados.
  - Tabela de controle de migrações `_migrations_history`.
  - UPSERT idempotente em `jobs` e sincronização de tags em `job_tags`.
  - Deduplicação por provedor + ID externo e hash canônico SHA-256 (`canonical_hash`).
- **Sistema de Publicação Discord**:
  - Roteamento por senioridade, região e remuneração em USD.
  - Formatação profissional de Discord Embeds com cores temáticas.
  - Sanitização estrita contra menções (`@everyone`, `@here`, `<@&...>`) e `allowed_mentions: { parse: [] }`.
  - Fila com estados (`PENDING`, `SENDING`, `SENT`, `RETRY`, `FAILED`, `SKIPPED`).
  - Tratamento de HTTP 429 (`Retry-After`) e backoff exponencial.
  - Suporte completo a simulação sem envio real via `DRY_RUN=true`.
- **Moderação e Controle de Spam**:
  - Blocklist configurável de empresas e domínios maliciosos.
  - Limite por execução (`MAX_PUBLICATIONS_PER_RUN`) e limite diário por canal (`MAX_PUBLICATIONS_DAILY`).
  - Filtro de qualidade mínima.
- **Bootstrap Seguro**:
  - Procedimento para primeira execução catalogar inventário histórico sem disparar flood no Discord (`is_historical = true`).
- **Automação CI/CD**:
  - Workflows do GitHub Actions para teste/lint, coleta agendada a cada 30 minutos, publicação a cada 30 minutos e execução manual (`workflow_dispatch`).
- **CLI Administrativa**:
  - Comandos: `collect`, `publish`, `bootstrap`, `dry-run`, `status`, `health`, `migrate`, `sources:list`, `sources:toggle`, `sources:test`, `blocklist:list`, `blocklist:add`.
- **Suíte de Testes**:
  - 46 testes automatizados cobrindo unitários, integração em memória (`pg-mem`) e simulação E2E.
