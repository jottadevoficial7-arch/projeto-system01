# Validação desta entrega

A versão foi executada com Node.js 24 e Next.js 16, usando SQLite em disco.

- Instalação limpa via `npm ci`: aprovada em diretório separado usando o lockfile entregue.
- `npm run build`: aprovado, incluindo verificação TypeScript e geração da aplicação.
- `npm test`: 30 testes aprovados, sem falhas ou testes ignorados.
- `npm run test:e2e`: 8 testes aprovados no Chromium, sendo 4 desktop e 4 mobile.

Os fluxos de navegador verificam demonstração identificada e isolada, cadastro com zero XP, criação e edição de missões, conclusão, persistência após recarregar, arquivamento sem perda de XP, exportação, logout e novo login, descanso, perfil, redução de animações, calendário e ausência de rolagem horizontal nas telas testadas.

Os testes de servidor verificam autorização entre usuários, sessões, senhas, duplicidade, limite diário, regras semanais, virada de dia em São Paulo, descanso, disciplina, preservação do histórico e rollback de transações.

Os testes usaram bancos descartáveis, separados do armazenamento normal da aplicação. Nenhuma conta pessoal, senha, token de sessão ou banco de teste é incluído no ZIP.

A entrega é uma aplicação executável de instância única, não um HTML estático. Não houve publicação no GitHub ou hospedagem pública. Consulte `roadmap.md` para funções posteriores ao MVP e `../README.md` para execução e implantação com disco persistente.
