# Escopo entregue e próximos passos

O objetivo desta entrega é uma aplicação utilizável, com ciclo completo de conta, missões e progressão persistente. A demonstração tem identificação explícita, e contas pessoais começam sem progresso fictício.

## MVP implementado

- Identidade visual original, navegação desktop/mobile, gráficos, emblema de rank e notificações na interface.
- Cadastro, login, logout e sessões persistidas com autorização por usuário.
- Missões recorrentes diárias ou semanais, criação, edição, arquivamento e histórico de execução.
- XP no servidor, teto diário, unicidade de conclusão, níveis e requisitos transparentes de ranks.
- Disciplina proporcional, avaliações de dias vencidos e descanso do dia atual.
- Painel de evolução, calendário mensal com registros, visão semanal, atributos e marcos de conquista.
- Preferências de perfil, redução de movimento, exportação JSON e testes automatizados.

## Próxima etapa de produto

1. Onboarding com áreas de interesse, horários disponíveis e frequência, gerando sugestões adaptadas; atualmente há um conjunto inicial editável e preferências de perfil.
2. Planejamento em dias específicos da semana, pausas futuras e ausências justificadas com histórico próprio; o descanso atual cobre o dia de hoje.
3. Notificações agendadas e opt-in para push. O aplicativo hoje mostra feedback enquanto está aberto.
4. Importação validada de exportações, ferramentas de exclusão de conta e controles de retenção.
5. Títulos selecionáveis, mais conquistas e prestígios posteriores ao rank S.
6. Análise mensal detalhada e personalização adicional de metas e painel.

## Antes de um lançamento comercial público

1. Migrar a persistência para PostgreSQL com migrações, pooling e testes de concorrência entre instâncias. Avaliar Prisma conforme o plano de hospedagem.
2. Implementar confirmação de e-mail, recuperação de senha, política de sessão e gerenciamento de dispositivos.
3. Adicionar limites de borda por origem/IP, controle de criação de demonstrações, limpeza de contas temporárias e mecanismos de proteção contra abuso.
4. Automatizar backups com testes de restauração, monitoramento, alertas, rastreamento de erros e procedimentos de incidente.
5. Revisar acessibilidade com tecnologias assistivas, realizar testes com usuários e validar contraste e navegação em uma matriz maior de dispositivos.
6. Definir políticas de privacidade, retenção, exclusão e atendimento compatíveis com a operação real do produto.

Esses itens estão registrados como trabalho futuro; a compilação local e os testes não significam que um serviço público tenha sido publicado, auditado ou configurado com backup operacional.
