# THE SYSTEM

Uma aplicação de evolução pessoal em português brasileiro: transforme atividades reais em missões, acumule experiência e acompanhe uma rotina sustentável. A identidade visual usa um painel escuro, emblemas originais, detalhes ciano e progressão de RPG.

Esta versão é um **MVP executável com persistência no servidor**, adequado ao desenvolvimento e a uma instalação privada de instância única. O [roadmap](docs/roadmap.md) registra o trabalho necessário antes de um lançamento comercial amplo.

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

## Requisitos e execução

- **Node.js 24.x** e npm. A versão está indicada em `.nvmrc`.
- Um diretório gravável para o banco SQLite. Não é necessário configurar um serviço de banco externo.

Na raiz do projeto:

```bash
npm ci
npm run dev
```

O servidor escuta na porta 3000. Abra essa porta no navegador da sua máquina ou use o acesso disponibilizado pelo seu ambiente. A primeira visita cria uma demonstração independente. Use **Criar meu sistema** para iniciar uma conta pessoal.

Se o diretório de cache padrão do npm não for gravável, defina `npm_config_cache` para um diretório permitido antes de executar `npm ci`.

Para executar a compilação de produção:

```bash
npm run build
npm start
```

`npm start` requer uma compilação concluída. Para outra porta, use `npm start -- --port 3100` ou `npm run dev -- --port 3100`.

## Configuração

O aplicativo funciona com os valores padrão. Para personalizar, copie `.env.example` para `.env.local` e ajuste:

| Variável | Uso | Padrão |
|---|---|---|
| `SYSTEM_DB_PATH` | Caminho do arquivo SQLite, relativo à raiz ou absoluto | `data/system.sqlite` |
| `COOKIE_SECURE` | `true` quando a aplicação é servida por HTTPS | `false` no exemplo local |
| `APP_ORIGIN` | Origem pública completa quando existe proxy reverso, como `https://seu-dominio.example` | Origem da requisição |

Não use `COOKIE_SECURE=true` ao testar por HTTP local: o navegador não enviará esse cookie por uma conexão insegura. Em produção, configure HTTPS e a origem pública correta. Senhas e tokens não devem ser colocados nesses arquivos nem versionados.

O banco é criado automaticamente. `data/`, `.env.local`, dependências e resultados de build estão no `.gitignore`. As datas da rotina usam **America/Sao_Paulo**. O horário de uma missão organiza a rotina; o fechamento ocorre após a virada do dia, não no horário planejado.

## Verificação

```bash
npm run typecheck
npm test
npm run build
```

Os testes unitários cobrem a progressão. Os testes de integração usam SQLite temporário e cobrem autenticação, autorização, persistência, regras de conclusão, descanso e avaliações diárias. Eles não precisam de um servidor HTTP ativo.

Os testes de navegador precisam da aplicação em execução e de Chromium:

```bash
# Terminal 1
npm run dev
```

```bash
# Terminal 2
npm run test:e2e
```

A configuração usa `/usr/bin/chromium` quando disponível. Para outro binário, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Sem navegador do sistema, instale o Chromium do Playwright com `npx playwright install chromium`. Para um servidor em outra porta, defina `E2E_BASE_URL` antes do comando de teste. A suíte cria perfis de teste independentes e executa os mesmos fluxos em desktop e mobile; use um banco descartável para não misturar essas contas com uma instalação pessoal.

Os testes não iniciam nem encerram o servidor automaticamente. O relatório HTML fica em `playwright-report/`; falhas preservam capturas e traces em `test-results/`.

## Persistência e instalação

SQLite mantém os dados após recarregar o navegador ou reiniciar o processo, desde que o arquivo de banco seja preservado. Use **uma instância da aplicação com disco persistente**; hospedar em funções sem disco persistente pode perder dados e não é compatível com esta configuração.

Para backup simples e consistente, encerre a aplicação, preserve todo o diretório `data/` e reinicie. Uma política de backup automatizada para serviço público deve usar mecanismos próprios de snapshot/backup do SQLite e testar restaurações. A exportação individual em JSON contém o histórico e as preferências; a interface de importação ainda não faz parte desta versão.

A publicação no GitHub ou em um provedor de hospedagem não é feita pelos comandos de build. Para escalar para múltiplas instâncias, o próximo passo é migrar a persistência para PostgreSQL e revisar limites, observabilidade e operações.

## Organização

```text
src/app/                Páginas, estilos, layout e rotas HTTP
src/components/         Interface e fluxos da aplicação
src/lib/progression.ts  Regras matemáticas puras e versionadas
src/lib/service.ts      Casos de uso e validações do servidor
src/lib/db.ts           Schema, conexão e transações SQLite
src/lib/auth.ts         Senhas, sessões, limites e proteção de requisições
tests/                  Testes de domínio e integração
tests/e2e/              Fluxos no navegador
docs/                   Arquitetura, progressão e próximos passos
```

Leia [as regras de progressão](docs/progression.md), [a arquitetura](docs/architecture.md) e [o escopo restante](docs/roadmap.md).
