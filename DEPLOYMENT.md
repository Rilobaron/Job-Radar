# Guia de Implantação e Operação — JobRadar v1.0

Este guia contém as instruções passo a passo para configurar a infraestrutura e colocar o **JobRadar v1.0** em produção com custo zero (usando Supabase e GitHub Actions).

---

## 1. Pré-Requisitos

- **Node.js**: Versão 20 LTS ou 22 LTS (ou superior).
- **Conta no Supabase** (Plano Free disponível em [supabase.com](https://supabase.com)).
- **Servidor Discord** com permissão de Gerenciar Webhooks.
- **Repositório GitHub** (com permissão de configurar Secrets).

---

## 2. Passo 1: Configuração do Supabase (PostgreSQL)

1. Crie um novo projeto no Supabase.
2. Acesse **Project Settings > Database**.
3. Copie a **URI de Conexão**:
   - Modo Pooling (porta 6543) ou Direct Connection (porta 5432).
4. Rode as migrações automáticas:
   ```bash
   export DATABASE_URL="postgresql://postgres.[REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
   npm run migrate
   ```
5. As migrações criarão:
   - Todas as tabelas operacionais (`sources`, `jobs`, `job_tags`, `discord_channels`, `publications`, `collection_runs`, `publication_attempts`).
   - RLS habilitado, garantindo que o acesso anônimo (`anon`) esteja revogado e apenas o backend autenticado opere.

---

## 3. Passo 2: Configuração dos Canais e Webhooks no Discord

Crie os canais no seu servidor Discord e gere um webhook para cada um (**Configurações do Canal > Integrações > Webhooks > Novo Webhook**):

| Canal Sugerido | Finalidade | Variável de Ambiente |
| :--- | :--- | :--- |
| `#geral-vagas` | Webhook padrão de fallback | `DISCORD_WEBHOOK_DEFAULT` |
| `#estagio-trainee` | Vagas para estagiários e trainees | `DISCORD_WEBHOOK_INTERN` |
| `#vagas-junior` | Vagas nível júnior / entry level | `DISCORD_WEBHOOK_JUNIOR` |
| `#vagas-pleno` | Vagas nível pleno | `DISCORD_WEBHOOK_MID` |
| `#vagas-senior` | Vagas sênior, lead e staff | `DISCORD_WEBHOOK_SENIOR` |
| `#brasil-remoto` | Vagas 100% remotas no Brasil | `DISCORD_WEBHOOK_BRAZIL_REMOTE` |
| `#internacional` | Vagas remotas globais / LATAM | `DISCORD_WEBHOOK_INTERNATIONAL` |
| `#vagas-em-dolar` | Vagas com salário explícito em USD | `DISCORD_WEBHOOK_USD` |

> **Nota:** Se você configurar apenas `DISCORD_WEBHOOK_DEFAULT`, todas as publicações aprovadas serão enviadas para esse webhook padrão automaticamente.

---

## 4. Passo 3: Configuração do Ambiente (.env)

Copie o `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
DATABASE_URL=postgresql://postgres.ref:sua-senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
DISCORD_WEBHOOK_DEFAULT=https://discord.com/api/webhooks/123/token-aqui
DISCORD_WEBHOOK_JUNIOR=https://discord.com/api/webhooks/123/token-junior
DISCORD_WEBHOOK_MID=https://discord.com/api/webhooks/123/token-pleno
DISCORD_WEBHOOK_SENIOR=https://discord.com/api/webhooks/123/token-senior
DISCORD_WEBHOOK_BRAZIL_REMOTE=https://discord.com/api/webhooks/123/token-remoto
DISCORD_WEBHOOK_USD=https://discord.com/api/webhooks/123/token-usd

DRY_RUN=false
LOG_LEVEL=info
MAX_PUBLICATIONS_PER_RUN=5
MAX_PUBLICATIONS_DAILY=50
```

---

## 5. Passo 4: Bootstrap Seguro Inicial

Na primeira inicialização, para evitar que centenas de vagas pré-existentes nas empresas floodem os canais do Discord:

```bash
npm run bootstrap
```

O comando irá:
1. Executar as migrações se ainda não foram aplicadas.
2. Sincronizar os canais padrão.
3. Coletar o inventário atual de todas as empresas e salvar no banco com a flag `is_historical = true`.
4. Exibir o resumo do que foi catalogado, sem enviar nenhuma mensagem ao Discord.

---

## 6. Passo 5: Automação via GitHub Actions

Configure os seguintes segredos no seu repositório (**Settings > Secrets and variables > Actions > New repository secret**):

- `DATABASE_URL`
- `DISCORD_WEBHOOK_DEFAULT`
- `DISCORD_WEBHOOK_INTERN`
- `DISCORD_WEBHOOK_JUNIOR`
- `DISCORD_WEBHOOK_MID`
- `DISCORD_WEBHOOK_SENIOR`
- `DISCORD_WEBHOOK_BRAZIL_REMOTE`
- `DISCORD_WEBHOOK_INTERNATIONAL`
- `DISCORD_WEBHOOK_USD`
- `DRY_RUN` (opcional: `false`)

Os workflows configurados em `.github/workflows/` entrarão em vigor:
- `collect.yml`: Roda a cada 30 minutos coletando novas vagas.
- `publish.yml`: Roda a cada 30 minutos distribuindo vagas pendentes com rate limit.
- `manual-run.yml`: Permite acionar qualquer comando da CLI pelo botão "Run workflow".

---

## 7. Monitoramento e Saúde Operacional

Para verificar o estado do sistema:
```bash
npm run status
npm run health
```

---

## 8. Checklist de Entrada em Produção (Go-Live)

Antes de alterar `PUBLICATION_ENABLED=true` para o seu servidor Discord real:

- [ ] **Banco Supabase / PostgreSQL Provisionado**: Connection string testada com `npm run health`.
- [ ] **Migrações Executadas**: Migrações 001, 002 e 003 aplicadas com sucesso (`npm run migrate`).
- [ ] **RLS Verificado**: Tabelas com Row Level Security ativo e permissões públicas revogadas.
- [ ] **Canais Discord Criados**: Webhooks criados em canais segmentados (ou canal único de testes).
- [ ] **Bootstrap Histórico Concluído**: `npm run bootstrap` executado para congelar o estoque atual das empresas com `is_historical = true` (evitando flood no Discord).
- [ ] **Validação com DRY_RUN**: `npm run dry-run` executado sem erros.
- [ ] **Homologação em Canal Privado**: Teste inicial com webhooks apontando para um canal privado de testes de staff.
- [ ] **Ativação Final**: Configurar `PUBLICATION_ENABLED=true` nos Secrets do repositório GitHub Actions ou no `.env`.

---

## 9. Procedimentos de Emergência e Resiliência

### 9.1 Como Desativar a Publicação Imediatamente (Kill Switch)
Em caso de qualquer anomalia nos envios:
1. Altere o secret ou variável `PUBLICATION_ENABLED=false`.
2. As execuções do publicador entrarão imediatamente em modo de segurança (logando aviso e sem enviar mensagens HTTP para o Discord).

### 9.2 Recuperação de Execuções Interrompidas (Lease Recovery)
Se um processo cair ou reiniciar abruptamente no meio de um disparo:
- O JobRadar utiliza um lease timeout de 5 minutos com `FOR UPDATE SKIP LOCKED`.
- Após 5 minutos, qualquer publicação pendente em `SENDING` que não tenha recebido confirmação é automaticamente desbloqueada e reabsorvida no ciclo seguinte.

### 9.3 Rollback / Forward-Fix
- **Rollback de Fonte Problemática**:
  ```bash
  npx tsx src/cli/index.ts sources:toggle <id-da-fonte> false
  ```
- **Adicionar Empresa ou Domínio à Blocklist Instantaneamente**:
  ```bash
  npx tsx src/cli/index.ts blocklist:add "NomeDaEmpresa"
  ```

