# 🎯 JobRadar v1.0 — Sistema Automatizado de Vagas para Discord

[![CI Tests](https://github.com/job-radar/job-radar/actions/workflows/test.yml/badge.svg)](https://github.com/job-radar/job-radar/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node: LTS](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

O **JobRadar v1.0** é uma plataforma open source, moderna e altamente confiável para **descoberta, normalização, enriquecimento, persistência e distribuição automatizada de vagas reais de tecnologia** diretamente em canais segmentados de servidores Discord.

O sistema atende uma **comunidade pública de desenvolvedores**, fornecendo apenas oportunidades com URLs originais de candidatura, sem fabricação de dados e com rigorosa prevenção de duplicações e spam.

---

## 1. O que é o JobRadar

O JobRadar monitora quadros de carreiras públicos de empresas de tecnologia (via APIs públicas oficiais do **Greenhouse**, **Lever** e **Ashby**), classifica os requisitos de senioridade, stack tecnológica, regime de trabalho (remoto, híbrido, presencial) e localização, e distribui as oportunidades formatadas com embeds limpos para canais temáticos no Discord.

---

## 2. Funcionalidades Implementadas

- 📡 **3 Conectores Independentes**:
  - **Greenhouse** (`boards-api.greenhouse.io`)
  - **Lever** (`api.lever.co`)
  - **Ashby** (`api.ashbyhq.com`)
- 🧠 **Classification Engine Determinístico**:
  - Detecção precisa de senioridade (Estágio/Trainee, Júnior, Pleno, Sênior, Staff/Lead).
  - Prevenção de falsos positivos na descrição (ex: vagas júnior que mencionam "mentoradado por sênior").
  - Identificação de mais de 30 tecnologias com regex de fronteira (`\b`).
  - Classificação de modalidade (100% Remoto, Híbrido, Presencial).
  - Segmentação geográfica (Brasil, Brasil Remoto, LATAM, Internacional).
  - Detecção comprovada de **Vagas em Dólar (USD)** exigindo evidência explícita.
  - Pontuação de integridade dos dados (Score 0-100).
- 💾 **Persistência e Idempotência**:
  - Armazenamento em PostgreSQL / Supabase.
  - Migrações versionadas com RLS para segurança no Supabase.
  - UPSERT idempotente em lote e deduplicação inteligente (por provedor + ID externo e hash canônico SHA-256).
- 📢 **Distribuição Discord**:
  - Embeds profissionais adaptados para desktop e mobile.
  - Sanitização de menções indesejadas (`@everyone`, `@here`) e `allowed_mentions` restritivo.
  - Fila com controle de estados (`PENDING`, `SENDING`, `SENT`, `RETRY`, `FAILED`, `SKIPPED`).
  - Rate limiting, backoff exponencial e tratamento do header `Retry-After` (HTTP 429).
  - Modo `DRY_RUN` para simulação completa sem envio real.
- 🛡️ **Moderação e Controle de Spam**:
  - Limite de disparos por execução (`MAX_PUBLICATIONS_PER_RUN`).
  - Limite diário por canal (`MAX_PUBLICATIONS_DAILY`).
  - Blocklist de empresas e domínios maliciosos.
  - Procedimento de **Bootstrap Seguro** para catalogar o histórico sem disparar flood.
- ⚙️ **Automação**:
  - Agendamento a cada 30 minutos via **GitHub Actions** (custo zero).
  - CLI administrativa completa para operação local e manutenção.

---

## 3. Arquitetura

O projeto adota Clean Architecture com camadas bem delimitadas:

```
src/
├── config/           # Validação Zod de variáveis de ambiente e constantes
├── domain/           # Contratos de dados imutáveis, schemas e erros tipados
├── providers/        # Conectores HTTP para Greenhouse, Lever e Ashby
├── classification/   # Motores de senioridade, tecnologia, modalidade e qualidade
├── persistence/      # Repositórios PostgreSQL (jobs, sources, runs, publications)
├── publisher/        # Fila, roteador de canais, rate limiter e cliente Discord
├── moderation/       # Blocklists e filtros de spam
├── observability/    # Logger estruturado seguro (sem vazar segredos)
├── services/         # Orquestradores de Coleta, Publicação e Bootstrap
└── cli/              # Interface de Linha de Comando (CLI)
```

Consulte [ARCHITECTURE.md](file:///c:/Users/Pichau/Desktop/Desenvolvimento/Job Radar/ARCHITECTURE.md) para detalhes técnicos aprofundados.

---

## 4. Requisitos

- Node.js LTS (v20+ ou v22+)
- NPM v10+
- Instância PostgreSQL (ex: Supabase Free Tier)

---

## 5. Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/job-radar/job-radar.git
cd job-radar

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
```

---

## 6. Configuração do Supabase

1. Crie um projeto no [Supabase](https://supabase.com).
2. Obtenha a connection string em **Project Settings > Database** (modo Connection Pooling na porta 6543 ou conexão direta na porta 5432).
3. Insira em `DATABASE_URL` no arquivo `.env`.
4. Execute as migrações:
   ```bash
   npm run migrate
   ```

---

## 7. Criação dos Webhooks Discord

No seu servidor Discord, acesse as configurações de cada canal desejado e gere o webhook correspondente (**Configurações > Integrações > Webhooks**):

- `DISCORD_WEBHOOK_DEFAULT`: Webhook padrão geral.
- `DISCORD_WEBHOOK_INTERN`: Canal para estágio e trainee.
- `DISCORD_WEBHOOK_JUNIOR`: Canal para vagas júnior.
- `DISCORD_WEBHOOK_MID`: Canal para vagas pleno.
- `DISCORD_WEBHOOK_SENIOR`: Canal para vagas sênior e staff.
- `DISCORD_WEBHOOK_BRAZIL_REMOTE`: Canal para vagas 100% remotas no Brasil.
- `DISCORD_WEBHOOK_INTERNATIONAL`: Canal para vagas remotas no exterior.
- `DISCORD_WEBHOOK_USD`: Canal exclusivo para vagas com remuneração explícita em dólar.

*O sistema funciona normalmente mesmo que apenas o webhook default esteja preenchido.*

---

## 8. Cadastro de Empresas

As fontes padrão ficam registradas em `config/default-sources.json`. Você pode listar, testar e alternar fontes usando a CLI:

```bash
# Listar todas as fontes cadastradas
npx tsx src/cli/index.ts sources:list

# Testar a coleta de uma empresa ao vivo
npx tsx src/cli/index.ts sources:test greenhouse gitlab
npx tsx src/cli/index.ts sources:test lever palantir
npx tsx src/cli/index.ts sources:test ashby linear

# Desativar ou ativar uma fonte
npx tsx src/cli/index.ts sources:toggle src_greenhouse_gitlab false
```

---

## 9. Configuração dos Filtros e Moderação

- **Pontuação de Qualidade**: Vagas com dados incompletos ou duvidosos recebem score inferior a 30 e são descartadas.
- **Blocklist de Empresas e Domínios**:
  ```bash
  npx tsx src/cli/index.ts blocklist:list
  npx tsx src/cli/index.ts blocklist:add "Empresa Suspeita"
  ```

---

## 10. Execução Local

```bash
# Executar coleta de vagas
npm run collect

# Executar disparo de vagas pendentes
npm run publish

# Executar simulação ponta a ponta sem disparos reais no Discord
npm run dry-run

# Consultar status do banco e fila de publicação
npm run status

# Executar diagnóstico de saúde
npm run health
```

---

## 11. Bootstrap Seguro

Ao inicializar o sistema pela primeira vez com um banco novo, rode o bootstrap:

```bash
npm run bootstrap
```

Todas as vagas já existentes nas fontes serão catalogadas e marcadas como históricas (`is_historical = true`). Isso impede que dezenas ou centenas de vagas antigas sejam postadas de uma só vez no Discord.

---

## 12. GitHub Actions

O repositório já contém os workflows em `.github/workflows/`:

- `test.yml`: Executa build, lint e testes em push/pull request.
- `collect.yml`: Roda a coleta automaticamente a cada 30 minutos.
- `publish.yml`: Roda o publicador no Discord a cada 30 minutos.
- `manual-run.yml`: Permite acionar qualquer comando manualmente pelo GitHub.

Cadastre os secrets do repositório em **Settings > Secrets and variables > Actions**:
- `DATABASE_URL`
- `DISCORD_WEBHOOK_*`

---

## 13. Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Sim (p/ persistência) | - | Connection string do PostgreSQL |
| `DISCORD_WEBHOOK_DEFAULT` | Sim (p/ publicação real) | - | Webhook Discord de fallback |
| `PUBLICATION_ENABLED` | Não | `false` | Trava de segurança: deve ser `true` para autorizar envio real ao Discord |
| `DRY_RUN` | Não | `false` | Simula tudo sem disparar mensagens |
| `LOG_LEVEL` | Não | `info` | Nível de log (`debug`, `info`, `warn`, `error`) |
| `MAX_PUBLICATIONS_PER_RUN` | Não | `5` | Limite de vagas por canal por ciclo |
| `MAX_PUBLICATIONS_DAILY` | Não | `50` | Limite diário por canal |
| `REQUEST_TIMEOUT_MS` | Não | `10000` | Timeout de rede em ms |
| `MAX_RETRIES` | Não | `3` | Retentativas com backoff |

---

## 14. Segurança

- **Credenciais**: Tokens de webhook nunca são salvos em texto puro no banco. URLs completas são mascaradas em logs.
- **Anti-Spam & Anti-Flood**: Limites estritos por canal e por ciclo.
- **Proteção contra Injeção**: Validação com Zod em todas as entradas e queries parametrizadas (`$1`, `$2`) no PostgreSQL.
- **RLS no Supabase**: Tabelas operacionais não são acessíveis pela chave anônima pública.

---

## 15. Troubleshooting

- **Erro de Conexão com Supabase**: Verifique se incluiu `?sslmode=require` na URL e confirme se está usando a porta correta (6543 para pooler, 5432 para direta).
- **HTTP 429 no Discord**: O JobRadar captura automaticamente o cabeçalho `Retry-After` e reagenda a publicação com backoff exponencial.
- **Vagas não chegam ao Discord**: Rode `npm run status` para conferir se há itens em `PENDING` ou execute `npm run dry-run` para validar o roteamento.

---

## 16. Testes Automatizados

A suíte conta com 46 testes cobrindo testes unitários, testes de integração em memória (`pg-mem`) e teste E2E completo:

```bash
# Executar todos os testes
npm test

# Executar com relatório de cobertura
npm run test:coverage
```

---

## 17. Limitações Conhecidas do MVP

- Provedores como Greenhouse e Ashby não fornecem um feed global de vagas; por isso, a descoberta requer o cadastro de empresas no catálogo (`sources`).
- Vagas em plataformas proprietárias como Gupy e LinkedIn requerem autenticação/scraping e não fazem parte do escopo inicial de APIs públicas do v1.0.

---

## 18. Roadmap Futuro

- **v1.1 — Bot Interativo Discord**: Slash commands (`/vagas`, `/buscar <tech>`), filtros individuais.
- **v1.2 — Preferências**: Inscrição por stack e notificações personalizadas para membros.
- **v2.0 — Inteligência**: Classificação assistida por IA e resumo automático de vagas.
- **v3.0 — Plataforma Pública**: Dashboard web, API REST e suporte a múltiplos servidores Discord.
