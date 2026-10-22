# PostgreSQL na Vercel: configuração e migração

## O que foi corrigido

A versão anterior abria `data/system.sqlite` e executava `mkdirSync` na primeira requisição. Na Vercel, o código da função fica em `/var/task`, onde não há disco gravável e persistente para esse banco. Trocar o caminho por `/tmp` perderia dados entre instâncias e deploys.

Agora todas as rotas usam PostgreSQL pelo pacote `pg`. Nenhuma rota cria diretórios, abre SQLite ou grava dados de usuário em arquivos. O banco fica fora dos deploys. O mesmo `DATABASE_URL` continua apontando para os mesmos dados após reiniciar ou atualizar a aplicação. Níveis, ranks, conquistas e estatísticas continuam calculados a partir dos registros preservados; as regras de progressão não foram substituídas.

## 1. Criar ou conectar o banco

1. No projeto da Vercel, abra **Storage / Marketplace** e conecte um PostgreSQL, por exemplo **Neon**. Também é possível usar um PostgreSQL existente. Os nomes exatos dos menus dependem da integração disponível.
2. Escolha uma região próxima da aplicação. Use um banco exclusivo de produção. Preview, desenvolvimento e testes devem usar bancos/branches separados.
3. No provedor, obtenha a URL de conexão com **pooling** para a aplicação e a conexão **direta** para administração/migração. Use conexões com TLS e certificado válido. Não desative a verificação do certificado para contornar um erro.
4. Ative backups automáticos ou recuperação para um ponto no tempo conforme o plano contratado. Teste uma restauração em um banco separado. Persistência entre deploys não substitui backup.

Nenhum banco externo ou credencial de produção é criado pelos comandos deste repositório.

## 2. Configurar variáveis

Em **Project Settings → Environment Variables**, configure:

| Nome            | Valor                                                                              | Onde usar                                   |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`  | URL real PostgreSQL com pooling fornecida pelo provedor                            | Production; URL diferente para Preview      |
| `APP_ORIGIN`    | Origem HTTPS real do site, sem caminho, por exemplo o domínio atribuído ao projeto | Production; ajustar se usar domínio próprio |
| `COOKIE_SECURE` | `true`                                                                             | Production e Preview HTTPS                  |

`POSTGRES_URL` também é aceito se `DATABASE_URL` estiver ausente. Se a integração criar outro nome/prefixo, configure `DATABASE_URL` com a URL correta. Uma variável `DATABASE_URL` já existente tem prioridade: confira para não conectar ao banco errado.

`DATABASE_DIRECT_URL` é opcional e usada **somente pelos comandos de migração**. Prefira mantê-la no terminal administrativo, sem conceder a credencial administrativa à função da Vercel. Nenhuma variável de banco pode ter prefixo `NEXT_PUBLIC_`. Nunca publique URLs com senhas em Git, logs, capturas ou chat.

Para Preview com domínio variável, deixe `APP_ORIGIN` ausente e use um banco de preview separado; a proteção de origem compara com o host da requisição. Para Production, fixe `APP_ORIGIN` no domínio usado pelo navegador. O acesso por outro domínio deve redirecionar para o domínio escolhido.

Remova a configuração antiga `SYSTEM_DB_PATH`: ela não é mais utilizada. `POSTGRES_PASSWORD` do Compose é exclusivamente local e não deve ser enviado para a Vercel.

## 3. Inicializar o schema antes de publicar

Em um computador/terminal confiável, com **Node.js 24.x**, use o código desta correção:

```bash
npm ci
```

Configure `.env.local` (ignorado pelo Git) com as URLs reais do banco de destino. Restrinja o acesso ao arquivo. Se usar variáveis de ambiente do terminal, elas têm prioridade sobre `.env.local`.

```bash
npm run db:migrate
npm run db:check
```

O primeiro comando cria o schema em uma transação e registra sua versão em `schema_migrations`. Pode ser repetido sem apagar contas ou registros. O segundo verifica a conexão, a versão e a leitura das tabelas, retornando `status: ok` e `storage: postgresql`. Confirme que a URL direta e a URL com pooling apontam para o mesmo banco/schema.

A build não conecta ao banco nem executa migrações. Isso evita que builds de preview alterem o banco de produção. Para contas com privilégios separados, a credencial de migração precisa criar tabelas; a credencial da aplicação precisa de acesso ao schema, `SELECT/INSERT/UPDATE/DELETE` nas sete tabelas de dados e `SELECT` em `schema_migrations`. Não é necessário disponibilizar uma credencial de superusuário à aplicação.

## 4. Preservar e migrar dados existentes

**Faça este passo antes de abrir o novo site ao público**, pois a primeira visita cria uma conta de demonstração e o importador exige um destino vazio. A presença de dados no destino provoca uma recusa; o importador não faz mesclagem nem sobrescreve contas.

1. Localize o SQLite que realmente contém os dados da versão anterior. Suspenda as gravações na aplicação antiga e em qualquer outro processo que use esse arquivo. Não use um SQLite de demonstração como substituto do banco real.
2. Preserve o arquivo e seus arquivos WAL/SHM associados. Não copie somente o arquivo principal enquanto existir um escritor ativo. O comando abaixo abre a origem em modo somente leitura e gera um backup consistente pela API do SQLite, incluindo transações confirmadas no WAL.
3. Inicialize um PostgreSQL de destino vazio com `npm run db:migrate`. Confirme cuidadosamente a URL de destino.
4. Execute a simulação:

```bash
npm run db:import-sqlite -- --source /caminho/real/system.sqlite
```

Sem `--apply`, o comando valida integridade, referências, compatibilidade das colunas e ausência de registros no destino. Mostra apenas contagens por tabela; não grava registros no PostgreSQL.

5. Crie um diretório privado e persistente para backups e escolha um **arquivo que ainda não exista**. Depois de efetivamente interromper as gravações, execute:

```bash
npm run db:import-sqlite -- \
  --source /caminho/real/system.sqlite \
  --apply \
  --backup /diretorio/privado/system-antes-da-migracao.sqlite \
  --confirm-writes-stopped
```

O sinalizador confirma uma ação operacional sua; o script não consegue detectar todos os escritores em outras máquinas. O arquivo de backup recebe permissão `0600` e nunca substitui um arquivo existente. Ele contém dados sensíveis e deve permanecer fora do Git e de downloads públicos.

A importação:

- preserva as sete tabelas: `users`, `sessions`, `missions`, `completions`, `rest_days`, `day_assessments` e `rate_limits`;
- mantém IDs, hashes de senha, tokens já derivados, prazos, recompensas e datas;
- bloqueia escritas no destino durante uma única transação;
- confere contagens e hashes do conteúdo de cada tabela antes do commit;
- reverte todas as inserções se qualquer tabela falhar, mantendo a origem e o backup;
- recusa repetir a importação sobre um destino já preenchido.

6. Confira as contagens, teste uma conta existente e verifique histórico, XP, missões e exportação. Guarde o backup original antes de liberar novas gravações.

Se houver registros válidos no destino, use outro banco vazio e planeje a troca da URL. Não apague os registros para forçar o importador a executar. Se for necessária uma mesclagem de bancos, ela exige uma migração específica com tratamento de conflitos.

Se o SQLite de produção nunca foi criado por causa do erro, não há arquivo daquela instância para migrar. Se um arquivo efêmero já desapareceu, é necessário recuperar um backup válido; logs de erro não permitem reconstruir dados de usuários. A correção não afirma recuperar arquivos inacessíveis.

## 5. Publicar e verificar na Vercel

1. Configure as variáveis e conclua schema/importação antes de promover a versão corrigida.
2. Use o preset **Next.js**, Node **24.x**, instalação `npm ci` e build `npm run build`. Mantenha o diretório de saída padrão do Next.js; não use exportação estática para estas APIs.
3. Publique o commit corrigido na branch configurada para produção ou promova o deployment apropriado após configurar seu ambiente. Alterações em variáveis exigem um novo deployment.
4. Acesse `/api/health` no domínio real. O esperado é HTTP 200 com `{"status":"ok","storage":"postgresql","schemaVersion":1}`. A consulta não cria demonstrações nem altera dados.
5. Abra o aplicativo, entre em uma conta de teste, conclua uma missão, recarregue e confirme que XP/histórico permanecem. Teste logout/login.
6. Faça outro deploy sem trocar o banco e repita a verificação. Só então considere a persistência **em produção** verificada.

O fato de os testes locais passarem não confirma que URLs, rede, permissões ou variáveis estejam corretas no seu projeto Vercel.

## Diagnóstico

Falhas de armazenamento retornam HTTP **503**, mensagem genérica e `requestId`; não retornam sucesso nem silenciam a falha. Os logs contêm o mesmo identificador, operação e código seguro. Não registram senhas, URL do banco, SQL com dados ou cookies. Erros de validação/autorização mantêm seus códigos 400/401/403/404/409/429.

| Código no log                                                | Verificação                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `DATABASE_URL_MISSING`                                       | Configurar `DATABASE_URL` ou `POSTGRES_URL` no ambiente do deployment e fazer redeploy |
| `DATABASE_URL_INVALID`                                       | Conferir a URL fornecida pelo provedor, sem divulgá-la                                 |
| `DATABASE_TLS_REQUIRED`                                      | Usar TLS com verificação de certificado para banco remoto                              |
| `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `DATABASE_FAILURE` | Conferir host, rede, disponibilidade, conexão com pooling e limites do provedor        |
| `28P01`                                                      | Conferir usuário/senha e atualizar o segredo após uma rotação                          |
| `42501`                                                      | Conferir permissões da credencial da aplicação                                         |
| `42P01`, `DATABASE_MIGRATION_REQUIRED`                       | Executar a migração no banco/schema correto                                            |
| `DATABASE_SCHEMA_NEWER`                                      | Usar código compatível com a versão já instalada; não rebaixar o schema                |

O pool tem no máximo cinco conexões por instância, com limites de conexão e consulta. Use o pooler do provedor para absorver múltiplas funções. Para certificados de uma autoridade privada, configure a CA confiável no ambiente Node; não use `rejectUnauthorized=false`.

## Retorno seguro em caso de falha

Antes de liberar o novo site, é possível interromper a publicação e manter a origem preservada. Depois de novas gravações em PostgreSQL, voltar ao SQLite antigo descartaria esses novos eventos. Nesse caso, prefira corrigir a versão mantendo o PostgreSQL e use backups do provedor quando necessário. Não faça downgrade automático nem apague o banco para corrigir uma configuração.
