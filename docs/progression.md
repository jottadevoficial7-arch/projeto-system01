# Progressão — regras v1

Todas as fórmulas vivem em `src/lib/progression.ts`. O servidor decide o XP concedido, a data local do perfil e a elegibilidade da missão. O navegador não informa a recompensa nem escolhe datas passadas para concluir atividades.

## XP e níveis

Missões fáceis concedem 10 XP; médias, 20 XP; difíceis, 35 XP. O limite é **150 XP por dia**, compartilhado entre todas as categorias. Quando só faltam 10 XP para o limite, uma missão de 35 XP concede 10. A missão continua podendo ser registrada ao atingir o limite, sem recompensa adicional.

A conclusão e o lançamento de XP devem ocorrer na mesma transação; a chave única por usuário, missão e data impede duplicatas. A base diária usa XP efetivamente concedido. Alterar ou excluir uma missão não apaga seus registros nem permite repetir sua recompensa do mesmo dia.

O nível inicial é 1. O custo para completar o nível `n` é `100 + 50(n − 1) + 10(n − 1)²` XP. O excedente segue para o próximo nível. Os primeiros níveis chegam cedo, mas o custo cresce: 100, 160, 240, 340… O nível não concede automaticamente um rank.

## Ranks

É obrigatório alcançar **ambos** os requisitos:

| Rank | Nome | XP acumulado | Dias ativos distintos |
|---|---|---:|---:|
| E | Despertar | 0 | 0 |
| D | Explorador | 2.000 | 21 |
| C | Constante | 9.000 | 90 |
| B | Determinado | 27.000 | 270 |
| A | Extraordinário | 55.000 | 540 |
| S | Transcendente | 100.000 | 900 |

Um dia ativo tem pelo menos uma conclusão real; várias conclusões no mesmo dia contam uma vez. Mesmo alcançando o limite diariamente, Rank S exige pelo menos 900 dias ativos (cerca de dois anos e meio). A 100 XP/dia, exige 1.000 dias; a 60 XP/dia, aproximadamente 1.667. Não é preciso preservar uma sequência perfeita para manter o rank. Dias ativos e XP acumulado nunca diminuem devido a faltas. Essas escolhas equilibram incentivo inicial e progressão longa sem impor atividade intensa.

## Disciplina e sequência

A disciplina é independente do XP e vai de 0 a 100. No encerramento de um **dia vencido**, completar pelo menos 80% das missões planejadas aumenta a disciplina em 2. Abaixo dessa meta, a redução é o número de missões pendentes, limitado a **3 pontos por dia**. Descanso planejado, pausa justificada ou dia sem missões não têm penalidade. Um dia atual ainda incompleto não é um dia perdido.

Cada avaliação diária deve ser persistida uma única vez por usuário/data, com a versão das regras usada. Não recalcular penalidades toda vez que a pessoa abre a página. O XP histórico jamais é reduzido por faltas. Se regras mudarem, preservar avaliações e recompensas já lançadas.

A sequência conta dias que alcançaram 80% da meta. Descanso preserva a sequência, sem incrementá-la. Dia vencido que não atingiu a meta interrompe a sequência. O cálculo exige que descansos sejam representados explicitamente: um intervalo de calendário sem registro interrompe a cadeia. Alterações posteriores no planejamento não devem modificar retroativamente as metas já avaliadas.

`assessDay` e `getDiscipline` são funções puras; não conferem vencimento, autorização ou unicidade. Essas garantias pertencem à camada de persistência. `getStreak` recebe somente dias já avaliados, ou o dia atual se ele já tiver atingido a meta, nunca o dia atual ainda pendente.

## Atributos e atividades

Categorias: Treinamento, Conhecimento, Rotina, Disciplina e Bem-estar. Atributos são indicadores de engajamento no aplicativo, não medidas científicas de capacidade física, inteligência ou saúde. Metas físicas devem ser escolhidas de acordo com a realidade da pessoa. Descanso faz parte da rotina, e nenhum benefício exige treino intenso.

## Verificação

`npx tsx --test tests/progression.test.ts` cobre limites e transições de nível, exigências simultâneas de rank, teto diário, entradas inválidas, disciplina limitada, descanso, lacunas de calendário, ano bissexto e duplicidade de avaliação no cálculo de sequência. A suíte de integração da API deve verificar autorização, transações, unicidade e vencimento dos dias.
