# THE SYSTEM

Uma aplicação de evolução pessoal em português brasileiro: transforme atividades reais em missões, acumule experiência e acompanhe uma rotina sustentável. A identidade visual usa um painel escuro, emblemas originais, detalhes ciano e progressão de RPG.

Esta versão é um **MVP executável com persistência no servidor**, com PostgreSQL para desenvolvimento e funções serverless da Vercel. O [roadmap](docs/roadmap.md) registra o trabalho necessário antes de um lançamento comercial amplo.

## Prévias da aplicação

Capturas reais do modo demonstração.

![Painel no computador](docs/preview/desktop.png)

[Ver a captura no celular](docs/preview/celular.png).

## O que funciona

- Demonstração identificada, com dados de exemplo isolados por sessão.
- Cadastro, login e logout; contas pessoais começam com zero XP e missões iniciais editáveis.
- Criação, edição e arquivamento de missões diárias ou semanais, categorias, duração, horário e dificuldade.
- Conclusão validada no servidor, limite diário de 150 XP e prevenção de recompensa duplicada.
- Níveis, ranks E a S, disciplina, sequências e descanso planejado para o dia atual.
- Painel, atributos de engajamento, calendário, evolução semanal, conquistas e histórico.
- Perfil personalizável, preferência de redução de animações e exportação de dados em JSON.
- Layout responsivo, navegação por teclado, diálogos nativos e feedback para operações.

Os atributos representam uso e consistência dentro do aplicativo. Eles não são medições científicas de força, inteligência ou saúde. As atividades devem ser adaptadas à realidade da pessoa.

## Executar localmente

Requisitos: **Node.js 24.x**, npm e PostgreSQL 17 (Docker Compose é uma opção).

1. Execute `npm ci` e copie `.env.example` para `.env.local`.
2. Escolha uma senha local em `POSTGRES_PASSWORD`. Configure `DATABASE_URL` com `postgresql://the_system:SENHA_CODIFICADA_PARA_URL@127.0.0.1:5432/the_system`, usando a mesma senha. O texto `SENHA_CODIFICADA_PARA_URL` é um marcador, não uma credencial válida.
3. Inicie e valide o banco:

```bash
docker compose --env-file .env.local up -d --wait postgres
npm run db:migrate
npm run db:check
```

4. Se existir `data/system.sqlite` da versão anterior, faça a [migração segura](docs/vercel-postgresql.md#4-preservar-e-migrar-dados-existentes) antes de abrir o aplicativo. O arquivo antigo não é apagado nem importado automaticamente.
5. Execute `npm run dev` e abra a porta 3000 no navegador da sua máquina. A primeira visita cria uma demonstração independente; **Criar meu sistema** inicia uma conta pessoal.

O volume nomeado do Compose mantém os dados após reiniciar os containers. Use `docker compose --env-file .env.local stop` para parar. Não remova o volume que contém seus dados. Se já possui PostgreSQL, basta configurar `DATABASE_URL`; Docker não é obrigatório.

Para produção local:

```bash
npm run build
npm start
```

A build não precisa de banco configurado. As APIs precisam de uma conexão válida e do schema instalado. Outra porta: `npm start -- --port 3100`. Se necessário, configure `npm_config_cache` para um diretório gravável antes de instalar dependências.

## Publicar na Vercel

Siga o [passo a passo completo de PostgreSQL, migração e Vercel](docs/vercel-postgresql.md).

| Variável              | Uso                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`        | Conexão PostgreSQL real; usar URL com pooling na Vercel                  |
| `POSTGRES_URL`        | Alternativa quando `DATABASE_URL` estiver ausente                        |
| `DATABASE_DIRECT_URL` | Opcional, conexão administrativa usada apenas pelos comandos de migração |
| `COOKIE_SECURE`       | `true` em HTTPS; `false` em HTTP local                                   |
| `APP_ORIGIN`          | Origem pública HTTPS real da aplicação em produção                       |
| `POSTGRES_PASSWORD`   | Senha exclusivamente do PostgreSQL local via Compose                     |
| `TEST_DATABASE_URL`   | Banco local separado, com nome terminado em `_test`, para testes         |

Nunca versionar credenciais nem usar `NEXT_PUBLIC_` para URLs de banco. `.env.local`, bancos SQLite antigos e backups ficam fora do Git. O antigo `SYSTEM_DB_PATH` não é usado. A aplicação não mantém dados de usuário em `/tmp` ou no disco das funções.

Todas as datas da rotina usam **America/Sao_Paulo**. O horário da missão organiza a rotina; o fechamento ocorre após a virada do dia, não no horário planejado.

## Verificar

Crie um banco local exclusivo para testes, por exemplo:

```bash
docker compose --env-file .env.local exec postgres createdb -U the_system the_system_test
```

Configure `TEST_DATABASE_URL` para esse banco usando a credencial local. Cada teste cria e remove apenas seu próprio schema aleatório, sem truncar tabelas existentes. A suíte recusa URLs remotas e nomes de banco sem o sufixo `_test`.

```bash
npm run typecheck
# TEST_DATABASE_URL deve estar exportada neste terminal:
npm test
npm run build
```

Se preferir guardar `TEST_DATABASE_URL` em `.env.local`, execute `node --env-file=.env.local --import tsx --test tests/*.test.ts`. Os testes cobrem domínio, autenticação, isolamento, persistência, concorrência, falhas de conexão e migração SQLite com backup e rollback. Só as fixtures descartáveis de migração usam SQLite temporário.

Para os oito testes de navegador, inicie a aplicação em um terminal com `DATABASE_URL` apontando para um banco de testes já inicializado, então execute `npm run test:e2e` em outro. Nunca use o banco de produção para E2E. Para outra porta, configure `E2E_BASE_URL`. O Chromium do sistema em `/usr/bin/chromium` é detectado; alternativamente use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ou `npx playwright install chromium`.

O [registro de validação](docs/VALIDACAO.md) distingue o que foi executado localmente do que ainda precisa de verificação na Vercel.

## Organização

```text
src/app/                Páginas, estilos, layout e rotas HTTP
src/components/         Interface e fluxos da aplicação
src/lib/progression.ts  Regras matemáticas puras e versionadas
src/lib/service.ts      Casos de uso e validações do servidor
src/lib/db.ts           Pool e transações PostgreSQL
src/lib/auth.ts         Senhas, sessões, limites e proteção de requisições
scripts/                Migração de schema, importação segura e diagnóstico
tests/                  Testes de domínio, integração e migração
tests/e2e/              Fluxos no navegador
docs/                   Arquitetura, progressão e próximos passos
```

Leia [as regras de progressão](docs/progression.md), [a arquitetura](docs/architecture.md) e [o escopo restante](docs/roadmap.md).
