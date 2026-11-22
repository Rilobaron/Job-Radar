# Guia de Contribuição — JobRadar

Agradecemos o seu interesse em contribuir para o **JobRadar**, uma ferramenta open source criada para apoiar a comunidade de desenvolvedores com vagas reais e verificadas.

---

## Como Contribuir

1. **Faça um Fork** do repositório.
2. **Crie uma Branch** para sua funcionalidade ou correção:
   ```bash
   git checkout -b feature/novo-provedor-ou-filtro
   ```
3. **Instale as dependências**:
   ```bash
   npm install
   ```
4. **Execute a suíte de testes**:
   ```bash
   npm test
   ```
5. **Garanta o padrão de código**:
   ```bash
   npm run lint
   npm run format
   npm run build
   ```
6. **Envie seu Pull Request**.

---

## Diretrizes de Código

- **TypeScript Strict**: Nunca use `any` implícito ou desligue o modo strict.
- **Validação com Zod**: Toda integração com APIs externas ou payloads de usuário deve ter schema Zod com testes de contrato.
- **Segurança de Credenciais**: Nunca versionar tokens, webhooks ou connection strings.
- **Sem Falsos Positivos**: Regras de classificação devem ser testadas com fixtures contra termos ambíguos.
- **Idempotência**: Nenhuma ação de persistência ou publicação pode gerar duplicações.
