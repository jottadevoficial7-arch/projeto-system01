# Arquitetura do MVP

## Decisões

Next.js 16 organiza a aplicação em uma página interativa e rotas HTTP do App Router. React 19 e TypeScript compõem a interface, com CSS próprio para a identidade visual. Fontes Inter e Rajdhani são instaladas como dependências e servidas pelo aplicativo; os ícones são Lucide. Não há dependência de APIs de imagens, IA ou fontes remotas em tempo de uso.

O servidor usa o módulo `node:sqlite` do Node.js 24. SQLite oferece persistência real e transações sem exigir credenciais ou um serviço adicional neste ambiente. A escolha atende uma instalação de instância única; PostgreSQL e uma camada de migrações são a evolução prevista para múltiplas instâncias. Esta versão não utiliza Prisma.

## Camadas

1. `src/components/system-app.tsx`: navegação, formulários, gráficos, estados de carregamento, mensagens e preferências visuais. Busca o estado autorizado nas rotas HTTP.
2. `src/app/api/`: recebe a solicitação, confere sessão e origem, valida o formato e traduz erros para respostas JSON.
3. `src/lib/service.ts`: regras de negócio, missões, conclusões, perfil, demonstração, avaliação diária e exportação.
4. `src/lib/progression.ts`: funções puras para níveis, ranks, limite de XP, disciplina e sequência. Testáveis sem banco ou navegador.
5. `src/lib/db.ts` e `auth.ts`: transações, schema, hashes, sessões e autorização.

## Persistência

| Tabela | Responsabilidade |
|---|---|
| `users` | Identidade, credenciais derivadas, preferências e estado de disciplina |
| `sessions` | Hash do token de sessão e prazo de validade |
| `missions` | Planejamento atual e arquivamento, com proprietário |
| `completions` | Livro de registros com título, categoria, recompensa e data da execução |
| `rest_days` | Descansos registrados por usuário/data |
| `day_assessments` | Avaliação única de cada dia vencido, com versão da regra |
| `rate_limits` | Contadores temporários para tentativas de autenticação |

O banco usa WAL, chaves estrangeiras e tempo de espera para escrita. A conclusão de uma missão calcula o saldo diário e grava a recompensa dentro da mesma transação. Índices únicos impedem duplicação por missão/período e por título normalizado no mesmo dia. A edição e o arquivamento preservam os registros de conclusão existentes.

Não se tenta verificar automaticamente se uma pessoa realmente realizou uma atividade: o registro é autodeclarado. As proteções impedem duplicidade e manipulação direta dos números pela interface, mas não substituem um mecanismo de comprovação de atividades.

## Autenticação e requisições

As senhas são derivadas com `scrypt`, sal aleatório por credencial e comparação em tempo constante. O navegador recebe um token opaco aleatório em cookie `HttpOnly` e `SameSite=Lax`; o banco guarda somente o hash do token. A sessão expira em 30 dias e pode ser revogada no logout.

Cookies recebem `Secure` quando a origem é HTTPS, quando `APP_ORIGIN` define HTTPS ou quando `COOKIE_SECURE=true`. Operações de escrita exigem a origem esperada, e requisições declaradas como `cross-site` são rejeitadas. A camada de servidor valida a propriedade dos registros em cada operação e usa consultas parametrizadas.

As entradas são validadas com Zod, têm limites de tamanho e não podem determinar XP nem datas retroativas. O endpoint de autenticação limita tentativas por identidade de e-mail. Limites adicionais de borda, limpeza de demonstrações e proteção operacional contra abuso são necessários antes de uma oferta pública em larga escala.

## Rotas

| Método e rota | Efeito |
|---|---|
| `GET /api/system` | Estado do perfil; cria demonstração independente quando não existe sessão |
| `POST /api/auth` | Ação `register`, `login` ou `logout` |
| `POST /api/missions` | Cria uma missão do usuário autenticado |
| `PATCH /api/missions/:id` | Edita uma missão autorizada |
| `DELETE /api/missions/:id` | Arquiva uma missão, preservando histórico |
| `POST /api/missions/:id/complete` | Registra uma conclusão e calcula a recompensa no servidor |
| `POST /api/rest` | Ativa ou retira o descanso do dia atual |
| `PATCH /api/profile` | Atualiza nome, emblema, objetivo e tempo disponível |
| `GET /api/export` | Exporta os dados do perfil, sem hashes de senha ou tokens |

Respostas do estado e das APIs usam `Cache-Control: no-store`. Erros esperados têm mensagem em português; detalhes internos não são enviados ao cliente.

## Calendário e fechamento

A data é determinada pelo servidor em `America/Sao_Paulo`. Missões diárias podem ser registradas uma vez por dia; as semanais têm período iniciado na segunda-feira e avaliação de pendência no domingo. O horário configurado é uma referência de planejamento.

Dias vencidos são avaliados ao acessar o estado ou executar operações relevantes. O sistema persiste a avaliação uma vez por dia, antes de permitir alterações que poderiam reinterpretar o planejamento anterior. O dia atual ainda incompleto não gera punição. Descanso protege a sequência e não aumenta a contagem de dias concluídos. O detalhamento matemático está em [progression.md](progression.md).

## Limites operacionais

O processo Node precisa de um disco persistente, Node 24 e uma única instância que compartilhe o banco. Não há e-mails transacionais, recuperação de senha, verificação de e-mail, notificações push, pagamento, sincronização offline ou importação de dados nesta versão. Exportação e armazenamento local no servidor estão implementados. Não é necessário nenhum segredo de serviço externo para executar o MVP.
