# cc-litellm

Plugin do Claude Code que mostra, sem sair do terminal, o que o seu proxy **LiteLLM** sabe sobre a **virtual key** que o Claude Code está usando: orçamento, ritmo de gasto, quanto dá para gastar por dia, limites, validade, modelos e uso dos últimos 30 dias. Também serve a scripts: `claude -p "/litellm check"` sai com um código que diz se o orçamento está bem.

Este repositório é um marketplace (`cc-litellm`) com um plugin: [`litellm-key`](plugins/litellm-key).

## O que você ganha

- **Status line** sob o prompt, sempre visível, com um medidor e a previsão: `⚠ litellm-key: ▰▰▰▰▰▱ 83% of budget · $41.37 of $50.00 · resets in 9d 2h (30d) · empty in 4d 8h`
- **Painel `/litellm` em quatro abas**, que atualiza sozinho:
  - **Overview**: barras de uso (chave, janelas, modelos, time e usuário), o tempo do período ao lado do orçamento, alertas, ritmo de gasto, previsão de quando o orçamento acaba, **quanto dá para gastar por dia** para ele durar até o reset, quantas requisições ainda cabem, o gasto de hoje contra o dia comum e o gasto desta sessão (com o ritmo por hora).
  - **Usage**: gráfico de barras por dia (7, 14 ou 30 dias) do gasto, das requisições ou dos tokens (tecla `m`), detalhe de um dia por modelo, requisições, tokens (entrada, saída e cache), dia de pico, tendência e a divisão por modelo, com uma seta ▲▼ de quanto cada modelo mudou contra os dias anteriores. Copia os dias como CSV.
  - **Models**: os modelos da chave com o gasto de cada um, filtro por texto, ordem por gasto ou nome e os tetos por modelo.
  - **Details**: tudo o que o proxy disse sobre a chave (hash, tipo, usuário, time, datas, limites) e como a leitura foi feita, com link para o painel do LiteLLM.
- **Previsão de gasto**: o ritmo do período até agora, até quanto o orçamento chega no reset nesse ritmo e quando ele acaba, se for antes dele. E o outro lado da conta, a **allowance**: quanto a chave pode gastar por dia daqui até o reset para o orçamento durar, e quanto cortar se o ritmo for maior.
- **Avisos** (toast) ao cruzar 80% (configurável), 95% e 100% do orçamento da chave, quando o ritmo vai estourá-lo antes do reset, quando a chave está para expirar (3 dias e 1 dia) e quando ela é bloqueada ou expira. Com `daily_alert`, também quando o gasto de hoje chega ao valor que você escolheu. Cada aviso aparece uma vez, mesmo entre sessões; os de orçamento e de ritmo voltam a cada novo período do orçamento. Os orçamentos de janela, de modelo, do time e do usuário aparecem no painel, sem toast. `show_toasts` desliga os toasts e deixa os avisos no painel, na status line e no `check`.
- **Comandos** para ver tudo como texto, comparar períodos modelo a modelo, ver um dia, copiar relatórios, entregar um relatório ao Claude para você perguntar sobre ele, testar cada endpoint com o tempo de resposta e diagnosticar a configuração.
- **Scripts**: `check` (OK, WARNING, CRITICAL ou UNKNOWN, com código de saída de 0 a 3 numa execução `claude -p`), `json` e `csv`.

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ claude-code-demo · sk-...2345  ● active       [ Refresh ] [ Copy ] [ Close ] │
│  1: Overview   2: Usage  3: Models  4: Details                               │
│                                                                              │
│ ▲ Budget                 ████████████████████████▉░░░░░ 83% → 119%           │
│   $41.37 / $50.00 (83%) · $8.63 left · resets in 9d 2h (30d)                 │
│ · Time                   ████████████████████▉░░░░░░░░░ 70%                  │
│   day 21 of 30 (70%) · 9d 2h left                                            │
│ · Window 1h              ██████▊░░░░░░░░░░░░░░░░░░░░░░░ 22%                  │
│   $1.12 / $5.00 · resets in 36m                                              │
│ · Model claude-opus-4-1  ██████████████████▋░░░░░░░░░░░ 62%                  │
│   $6.20 / $10.00 per 1d                                                      │
│ ▲ Team platform-eng      ███████████████████████████▍░░ 91% → 105%           │
│   $912.50 / $1,000.00 (91%) · $87.50 left · resets in 3d 23h (30d)           │
│ · User demo@example.com  ████████████▋░░░░░░░░░░░░░░░░░ 42%                  │
│   $63.40 / $150.00 (42%) · $86.60 left · resets in 9d 2h (30d)               │
│                                                                              │
│ ▲ Key budget is at 83%: $41.37 of $50.00                                     │
│ ▲ At this pace the key budget runs out in 4d 8h, before it resets            │
│ ▲ Team platform-eng is at 91%: $912.50 of $1,000.00                          │
│ ▲ At this pace Team platform-eng runs out in 2d 11h, before it resets        │
│                                                                              │
│ Pace                   $1.98/day · on pace for $59.45 (119%) at the reset    │
│ Runs out               in 4d 8h · 4d 18h before the reset                    │
│ Allowance              $0.95/day to last · now $1.98/day (cut 52%)           │
│ Headroom               about 76 more requests at $0.113 each (7-day average) │
│ Limits                 120 rpm · 400k tpm · 8 parallel                       │
│ Expires                in 39d                                                │
│ Models                 claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5, │
│                        gpt-5 (4)                                             │
│ Lifetime               $128.87 across budget resets                          │
│ Today                  $5.17 · 46 requests · 2.5× the usual day ($2.03)      │
│ Last 7 days            ▂▅▅▄▃▆█ · $18.53 · 164 requests · 3.9M tokens         │
│ Session                nothing spent since 17:26 (1m ago)                    │
│                                                                              │
│ 127.0.0.1:4012 · via ANTHROPIC_AUTH_TOKEN                                    │
│ Updated 17:27:51 (14s ago) · every 60s                                       │
│ ctrl+x tab, or a click, gives the pane the keyboard                          │
╰──────────────────────────────────────────────────────────────────────────────╯
```

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ claude-code-demo · sk-...2345  ● active       [ Refresh ] [ Copy ] [ Close ] │
│ 1: Overview   2: Usage   3: Models  4: Details                               │
│                                                                              │
│ Spend per day (UTC)                7d   d: 14d  30d  m: chart: spend  v: CSV │
│                                                                              │
│ $5.17                                                               ██████   │
│                                                                     ██████   │
│                             ▄▄▄▄▄▄                        ██████    ██████   │
│                   ██████    ██████    ▄▄▄▄▄▄              ██████    ██████   │
│                   ██████    ██████    ██████    ██████    ██████    ██████   │
│    $0   ▄▄▄▄▄▄    ██████    ██████    ██████    ██████    ██████    ██████   │
│           Tue       Wed       Thu       Fri       Sat       Sun       Mon    │
│         $0.43     $2.59     $3.02     $2.15     $1.72     $3.45     $5.17    │
│                                                                              │
│ Pick a day under the chart for its details                                   │
│                                                                              │
│ Spend        $18.53 · $2.65/day                                              │
│ Requests     164 · $0.113 each                                               │
│ Tokens       3.9M · in 3.2M · out 741k · cache read 2.2M (71% of input)      │
│ Peak day     $5.17 on Mon Oct 5                                              │
│ Active days  7 of 7                                                          │
│ Trend        ▲ 10% vs the 7 days before (full days)                          │
│                                                                              │
│ By model, last 7 days · ▲▼ vs the 7 before ───────────────────────────────── │
│ claude-sonnet-4-5  █████████████▊░░░░░░░░░░  58%  $10.66 ▲ 9% · 89 requests  │
│ claude-opus-4-1    ██████▊░░░░░░░░░░░░░░░░░  28%  $5.24 ▲ 11% · 43 requests  │
│ claude-haiku-4-5   ██▎░░░░░░░░░░░░░░░░░░░░░   9%  $1.69 ▲ 11% · 11 requests  │
│ gpt-5              █▎░░░░░░░░░░░░░░░░░░░░░░   5%  $0.94 ▲ 18% · 5 requests   │
│                                                                              │
│ 127.0.0.1:4012 · via ANTHROPIC_AUTH_TOKEN                                    │
│ Updated 17:27:22 (just now) · every 60s                                      │
│ 1-4 tabs · r refresh · c copy · q or esc close                               │
╰──────────────────────────────────────────────────────────────────────────────╯
```

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ claude-code-demo · sk-...2345  ● active       [ Refresh ] [ Copy ] [ Close ] │
│ 1: Overview  2: Usage   3: Models   4: Details                               │
│                                                                              │
│ 4 models                                    7d   d: 14d  30d  s: sort: spend │
│                                                                              │
│ f: Filter type to narrow the list                                            │
│                                                                              │
│ claude-sonnet-4-5  █████████▎░░░░░░  58%  $10.66 · 89 requests               │
│ claude-opus-4-1    ████▌░░░░░░░░░░░  28%  $5.24 · 43 requests · cap $10/1d   │
│ claude-haiku-4-5   █▌░░░░░░░░░░░░░░   9%  $1.69 · 11 requests                │
│ gpt-5              ▊░░░░░░░░░░░░░░░   5%  $0.94 · 5 requests                 │
│                                                                              │
│ 127.0.0.1:4000 · via ANTHROPIC_AUTH_TOKEN                                    │
│ Updated 14:32:05 (12s ago) · every 60s                                       │
│ ctrl+x tab, or a click, gives the pane the keyboard                          │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Instalação

Requer um Claude Code recente: o plugin usa hooks de função (API em acesso antecipado), testados na 2.1.288 e na 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Para testar a partir de um clone, sem instalar: `claude --plugin-dir ./plugins/litellm-key`.

## Configuração

Se o Claude Code já fala com o LiteLLM, **não precisa configurar nada**. O plugin lê a mesma URL e a mesma chave que o Claude Code usa, nesta ordem (variáveis do processo primeiro, depois o bloco `env` do `settings.json`):

| O quê | De onde |
| --- | --- |
| URL | opção `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Chave | opção `litellm_key`, header `x-litellm-api-key` de `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

Se a URL do ambiente termina numa rota de pass-through (`/anthropic`, `/bedrock`, `/v1`…), o plugin também tenta a raiz do proxy; um `litellm_url` é usado como foi escrito. Cada chave só é usada com a URL a que pertence: as chaves do ambiente nunca vão para um `litellm_url` de outro host, e `LITELLM_PROXY_API_BASE` só se casa com `LITELLM_PROXY_API_KEY`.

Todas as opções são opcionais (o Claude Code avisa na instalação que elas "não foram definidas"; pode ignorar). Para mudá-las, use `/plugin configure litellm-key@cc-litellm` ou `claude plugin configure litellm-key@cc-litellm --values-stdin`, com um JSON de strings:

| Opção | Padrão | Para quê |
| --- | --- | --- |
| `litellm_url` | vazio | Proxy fora do padrão (Bedrock/Vertex via LiteLLM, URL com prefixo). |
| `litellm_key` | vazio | Chave explícita. Guardada no armazenamento seguro, não no `settings.json`. |
| `refresh_seconds` | 60 | Intervalo de leitura (15 a 3600). Também lê de novo depois de cada turno, no máximo a cada 20 s. |
| `warn_percent` | 80 | Primeiro aviso de orçamento, de 1 a 99 (também avisa em 95% e 100%). |
| `daily_alert` | 0 (desligado) | Avisa quando o gasto de **hoje** (UTC) chega a esse valor em dólares: um toast por dia, um trecho na status line (`today $12.40 (alert $10.00)`) e uma linha no painel. Precisa do histórico de uso (`show_usage`); com ele ligado, o histórico é lido a cada 3 minutos, não a cada 10. |
| `show_toasts` | sim | Os toasts de aviso (orçamento, ritmo, alerta diário, validade, proxy fora do ar). Desligado, os avisos ficam na status line, no painel e no `/litellm check`. O aviso que responde a um clique (como "Copied the summary") continua aparecendo. |
| `show_status_line` | sim | Linha fixa sob o prompt. |
| `status_bar` | sim | Começa a status line com um medidor do orçamento (`▰▰▰▰▰▱`). Desligado, fica só o texto. |
| `show_forecast` | sim | A previsão de gasto: o ritmo, a barra Time e a seta `→ N%` no painel, o "empty in" na status line e o aviso de que o orçamento acaba antes do reset. |
| `show_related` | sim | Lê `/user/info` e `/team/info`: esses orçamentos também bloqueiam requisições. |
| `show_usage` | sim | Lê `/user/daily/activity` (endpoint beta do LiteLLM) para os 30 dias de uso. |
| `compact_pane` | não | Painel compacto acima do prompt em terminais estreitos (de 74 a 121 colunas): um medidor por linha, fatos lado a lado, os alertas numa linha e só a altura necessária. Desligado, mantém o layout empilhado, mais folgado. |

## Comandos

| Comando | Faz |
| --- | --- |
| `/litellm` | Abre o painel, na aba em que você o deixou (e responde com uma linha de resumo). Sem tela, imprime essa aba como texto. |
| `/litellm tab <nome>` | Abre o painel numa aba: `overview`, `usage`, `models` ou `details` (ou `1` a `4`). Sem tela, imprime a aba como texto. |
| `/litellm refresh` | Lê de novo agora. |
| `/litellm info` | Imprime o resumo completo no transcript. |
| `/litellm status` | Imprime a linha da status line, como texto. |
| `/litellm pace` | Para onde o orçamento vai e quanto dá para gastar por dia: orçamento, tempo do período, ritmo, quando acaba, allowance, requisições que ainda cabem, gasto de hoje e da sessão. O mesmo para o time e o usuário, quando eles têm teto. Funciona com `show_forecast` desligado, porque você pediu. |
| `/litellm usage [7\|14\|30]` | Imprime o gasto por dia, com totais, tokens e a divisão por modelo. |
| `/litellm compare [7\|14]` | Os últimos 7 (ou 14) dias completos contra os mesmos dias antes deles: gasto, requisições, tokens, preço por requisição e, modelo a modelo, quem subiu, quem caiu, quem é novo e quem sumiu. Fica de fora o dia de hoje, que não acabou. Com 30 dias não dá: o plugin lê 30 dias, e a conta pede 60. |
| `/litellm day [quando]` | Um dia por modelo, com tokens, falhas e quantas vezes ele foi o dia comum. `quando` é `today` (padrão), `yesterday`, uma data (`2026-10-03` ou `10-03`) ou um dia da semana (`mon`, `monday`: o último que o histórico tem). |
| `/litellm models [texto]` | Lista os modelos que a chave pode chamar; com um texto, só os que o têm no nome. |
| `/litellm check [aviso%]` | Um veredito de uma palavra: `OK`, `WARNING`, `CRITICAL` ou `UNKNOWN`, com os alertas embaixo e o **código de saída** 0, 1, 2 ou 3 numa execução `claude -p` (veja [Em scripts](#em-scripts)). `aviso%` troca o limite do aviso só desta vez. |
| `/litellm json` | Tudo o que o plugin sabe da chave, em JSON, e nada mais. |
| `/litellm csv [7\|14\|30]` | Os dias do período em CSV, e nada mais. |
| `/litellm copy [o quê]` | Copia um relatório para a área de transferência: `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` ou `json`. Sem nome, copia a aba em que o painel está; depois do nome pode vir o período (`copy usage 30`). |
| `/litellm share [o quê]` | Entrega um relatório (o `overview` por padrão) ao Claude, sem mostrá-lo no transcript, para você perguntar sobre ele ("por que o gasto subiu no sábado?"). Só isso e só quando você pede: nada vai ao modelo por conta própria. |
| `/litellm ping` | Pergunta uma vez a cada endpoint que o plugin lê (`/key/info`, `/user/info`, `/team/info`, `/v1/models`, `/user/daily/activity`, `/health/readiness`) e diz o status, o tempo e o que veio, ou por que não veio. É o jeito de saber qual leitura falha. Numa execução `claude -p` sai com 3 se nem o `/key/info` responde (os outros endpoints são opcionais). |
| `/litellm debug` | Mostra de onde saem URL e chave (a chave aparece só mascarada), o que foi tentado, a versão do LiteLLM e a latência, e o resultado. |
| `/litellm close` | Fecha o painel. |
| `/litellm help` | Lista os comandos. |

Há apelidos: `pane` e `open` para o painel, `view` para `tab`, `hide` para `close`, `reload` e `r` para `refresh`, `text` e `summary` para `info`, `line` para `status`, `forecast` e `runway` para `pace`, `movers` para `compare`, `health` para `ping`, `diag` e `doctor` para `debug`. Um comando escrito errado recebe um "Did you mean".

### Em scripts

`claude -p "/litellm …"` roda o comando sem abrir a conversa. `check`, `json` e `csv` foram feitos para isso: o texto sai no stdout e, no `check`, o processo termina com o código do veredito (como os plugins do Nagios, que todo monitor já entende):

| Código | Veredito | Quando |
| --- | --- | --- |
| 0 | `OK` | Nada precisa de atenção. |
| 1 | `WARNING` | Algo está perto: orçamento no limite do aviso, ritmo que estoura antes do reset, validade em menos de 3 dias, alerta diário. |
| 2 | `CRITICAL` | Algo quebrou: um orçamento estourado (o da chave, de uma janela, de um modelo, do time ou do usuário), a chave bloqueada ou expirada. |
| 3 | `UNKNOWN` | Não deu para saber: o proxy não respondeu (o último dado bom aparece ao lado), a chave foi recusada ou nada está configurado. |

```bash
# Em um cron, um CI ou um pre-push: falha se o orçamento passou de 90%.
claude -p "/litellm check 90" < /dev/null || echo "orçamento do LiteLLM: atenção"

# O JSON, para jq. O Claude Code assina com o nome do plugin a resposta de quem não vem com ele:
# a primeira linha começa com "litellm-key: ", que o sed tira.
claude -p "/litellm json" < /dev/null | sed '1s/^litellm-key: //' | jq '.budget.percent, .pace.emptyAt'
claude -p "/litellm csv 30" < /dev/null | sed '1s/^litellm-key: //' > uso.csv
```

O `< /dev/null` evita a espera de 3 segundos do `claude -p` por um stdin que não vem. O JSON tem uma versão (`schema`, hoje 1) e não tem credencial nenhuma: a chave aparece só pelo nome mascarado que o LiteLLM dá (`sk-...1234`), e o hash dela fica de fora.

| Campo | O que tem |
| --- | --- |
| `schema`, `readAt`, `stale`, `proxy` | A versão do formato, quando o proxy foi lido, por que a leitura está velha (`null` se não está) e o host. |
| `level` | `ok`, `warning` ou `critical`, como no `check`. |
| `key` | `alias`, `name`, `status`, `type`, `user`, `team`, `createdAt`, `lastActiveAt`, `expiresAt`. |
| `budget` | `spend`, `limit`, `percent`, `left`, `period`, `resetAt`, `softLimit`, `lifetimeSpend`. |
| `pace`, `allowance` | O ritmo (`basis`, `perDay`, `projected`, `projectedPercent`, `emptyAt`, `beforeReset`) e o que dá para gastar por dia e por hora até o reset; `null` quando não há como calcular. |
| `windows`, `modelBudgets`, `limits` | As janelas de orçamento, os tetos por modelo e `rpm`, `tpm`, `tpd`, `parallel`. |
| `related` | O orçamento do `user` e do `team`, ou `null`. |
| `models`, `usage`, `session`, `alerts` | Os modelos; o gasto de `today`, `last7` e `last30` (gasto, requisições, falhas, tokens, média por dia); o gasto da sessão; e os alertas, como no painel. |

Sem leitura (proxy fora do ar na primeira vez, nada configurado), o `json` imprime `{"schema": 1, "error": {…}}` e sai com 3.

## Teclado e mouse

Com o foco no painel (clique nele, ou `ctrl+x` `tab`), o rodapé lembra as teclas:

| Tecla | Faz |
| --- | --- |
| `1` a `4` | Troca de aba (Overview, Usage, Models, Details). |
| `r` | Atualiza. |
| `c` | Copia o que a aba mostra: o resumo, o relatório de uso, a lista de modelos (inteira, sem o filtro nem a ordem) ou os detalhes. Um aviso confirma o que foi copiado. |
| `q` | Fecha. |
| `d` | Usage e Models: passa para o próximo período (7, 14, 30 dias). Os períodos também se escolhem com um clique. |
| `m` | Usage: alterna o gráfico entre gasto, requisições e tokens (a escolha fica guardada). |
| `v` | Usage: copia como CSV os totais de cada dia do período. |
| `s` | Models: alterna a ordem entre gasto e nome. |
| `f` | Models: leva o teclado ao filtro, e digitar já filtra. O Enter só esvazia o campo (o filtro continua valendo, e aparece no lugar do texto de ajuda). Para limpá-lo: `Esc` e depois `x`, ou o botão. |
| `Esc` | Fecha o painel. Na aba Models, em que o campo do filtro usa o `Esc`, ele só devolve o teclado ao prompt: feche com `q`. |
| setas | Rolam o painel. |

Na aba Usage, clique no dia sob uma barra (ou `Tab` até ele e `Enter`) para ver o que aquele dia custou, por modelo (os três maiores). Os nomes dos dias precisam de 4 colunas por barra: cabem com 7 ou 14 dias e, com 30, só em painéis largos (cerca de 126 colunas de conteúdo).

O painel se adapta ao espaço: ao lado da conversa (tela cheia, a partir de 110 colunas) cada medidor ocupa duas linhas; com 118 colunas de conteúdo ou mais (acima do prompt, a partir de 122 colunas do terminal) os medidores viram uma tabela; acima do prompt em terminais mais estreitos ele segue com duas linhas por medidor, ou fica **compacto** se você ligar `compact_pane`: um medidor por linha, os fatos lado a lado e só a altura que o conteúdo precisa. O gráfico da aba Usage ajusta a largura das barras e, quando os dias não cabem, mostra só o primeiro e o último.

## Como ler o painel

- **Sinais**: `·` está tudo certo, `▲` perto do teto (o aviso, 80% por padrão), `✗` estourou. Os sinais valem para quem não distingue as cores.
- **`83% → 119%`**: o orçamento está em 83% e, se o ritmo do período continuar, chega a 119% no reset. A seta só aparece para quem vai passar do teto.
- **Time**: a barra do tempo do período, logo abaixo do orçamento. Se a barra do orçamento está mais cheia que a do tempo, o gasto está acima do ritmo.
- **Pace / Runs out**: o ritmo (gasto do período ÷ tempo decorrido), até quanto o orçamento chega no reset nesse ritmo e quando ele acaba, se for antes do reset. O ritmo só é calculado depois de 10% do período (mínimo de 15 minutos). Enquanto isso, ou se o período é desconhecido, entra no lugar a média diária dos últimos dias completos (até 7, a contar do primeiro com gasto), quando há histórico de uso da chave; com ela o painel mostra o ritmo e, se for dentro de 30 dias, quando o orçamento acaba, mas não a seta `→ N%`, o toast nem o "empty in". É uma extrapolação linear: um dia fora do comum a muda.
- **Allowance**: o outro lado do ritmo. É o que sobra do orçamento dividido pelo tempo que falta para o reset: `$0.95/day to last · now $1.98/day (cut 52%)` quer dizer que gastar até $0.95 por dia faz o orçamento durar até o reset, que o ritmo atual é de $1.98 e que cortar uns 52% resolve. Com menos de um dia para o reset a conta é por hora (`$0.20/h`); na última hora antes do reset não há conta, porque qualquer número seria absurdo. Só precisa de um teto e de um reset: aparece mesmo sem ritmo.
- **Headroom**: quantas requisições o que sobra do teto ainda paga, ao preço médio por requisição dos últimos 7 dias. Só aparece com 10 requisições ou mais na semana. "Requisição" é a unidade do proxy: um turno do Claude Code faz várias.
- **Today**: o gasto de hoje (UTC) e quantas vezes ele é o dia comum, a média dos últimos dias completos (até 7). De 3 vezes para cima, e com pelo menos um dólar a mais que o dia comum, a linha fica em aviso: um dia fora do comum. Não é um alerta nem um toast; para ser avisado de um valor seu, use `daily_alert`.
- **Session**: quanto a chave gastou desde a primeira leitura, com o Claude Code aberto, somando o gasto mesmo quando o orçamento reinicia no meio do caminho; depois de meia hora, com o ritmo por hora (`· $2.00/h`). Vale para a chave toda: se outros clientes a usam, o gasto deles entra.
- **Usage**: os dias do gráfico, o dia de pico e a tendência são em UTC, como o proxy conta (as datas de Details também); "Updated" e "Session" usam o relógio local. A tendência compara os últimos dias completos com o mesmo número de dias antes deles (o dia de hoje fica de fora, porque ainda não acabou), então só aparece quando o histórico tem o dobro: não com 30 dias. É a mesma conta do `/litellm compare`, e dela vêm as setas da lista **By model** (`$5.24 ▲ 11% · 43 requests`: o modelo gastou 11% a mais que nos 7 dias antes; `new` é um modelo que antes não gastou nada). As setas só aparecem com 7 ou 14 dias e com gasto no período anterior; o valor ao lado delas é o dos dias do gráfico, hoje incluído.
- **Failed**, na aba Usage, conta as requisições que falharam; **Soft limit**, em Overview, é o aviso de orçamento que o proxy tem configurado, quando há.
- **LiteLLM** e **Latency**, em Details: a versão do proxy e o estado do banco, como o `/health/readiness` os diz, e quanto o `/key/info` levou para responder na última leitura.

## De onde vêm os dados

Só leituras (`GET`), sempre com a sua própria chave:

| Endpoint | Para quê |
| --- | --- |
| `/key/info` | Alias, gasto, orçamento e janelas, reset, limites, validade, status, modelos, orçamentos por modelo. A cada leitura. |
| `/user/info`, `/team/info` | Orçamento do usuário e do time da chave, se a chave tiver um e se ele tiver teto. A cada leitura. |
| `/v1/models` | Modelos realmente liberados. A cada 10 min nas leituras do relógio. |
| `/user/daily/activity` | Gasto, requisições e tokens dos últimos 30 dias, por dia e por modelo, desta chave (pelo hash que o `/key/info` devolve; sem ele, do usuário). A cada 10 min nas leituras do relógio. |
| `/health/readiness` | A versão do LiteLLM e o estado do banco, para a aba Details e o `debug`. A cada 10 min nas leituras do relógio. É só uma gentileza do proxy: se ele não responde, não vira nota nem erro. |

As leituras do relógio e as de depois de um turno só refazem os modelos, o uso e a saúde do proxy a cada 10 minutos (3, com `daily_alert`); a primeira, o botão Refresh, `/litellm refresh` e qualquer comando que encontre a leitura com mais de 15 s leem tudo de novo. Cada requisição espera no máximo 4 s. Algo opcional que falhar (403, 404…) vira uma nota discreta no painel, nunca um erro, e fica o último dado bom. Se o proxy cair (rede, 5xx ou 429), o painel segue mostrando a última leitura boa, marcada como antiga; uma chave recusada (401, 403), sem registro (404) ou sem banco de dados esvazia o painel e diz o motivo.

## Privacidade

- A chave só viaja para o proxy que o Claude Code já usa, no header `Authorization` (ou `x-litellm-api-key`). Nunca em URL, log, toast, estado ou no armazenamento do plugin; mensagens de erro passam por um filtro que a mascara.
- O plugin guarda só os ids dos avisos já mostrados, para não repeti-los, e a sua preferência de período, de ordem e de gráfico.
- `/litellm share` é a única coisa que põe algo no contexto do modelo, e só quando você o digita: o relatório que você escolheu, sem a chave, que o Claude passa a poder ler. `copy`, `json` e `csv` mostram ou copiam o mesmo que o painel mostra, e nenhum deles tem a chave nem o hash dela.
- O link para o painel do LiteLLM (aba Details) é a raiz do proxy sem credenciais: um `usuario:senha@` na URL é retirado antes.
- `litellm-key` lê as variáveis `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` e `LITELLM_PROXY_API_KEY`, o bloco `env` do `settings.json` e faz requisições HTTP. `claude plugin validate plugins/litellm-key` lista tudo isso.

## Se algo não aparece

| Sintoma | Causa provável |
| --- | --- |
| Nada na status line e o toast diz "not configured" | Claude Code não está atrás de um proxy (`ANTHROPIC_BASE_URL` ausente ou `api.anthropic.com`). |
| "The proxy has no database record for this key" | É a master key, ou uma chave só do `config.yaml`. Só chaves criadas com `/key/generate` têm dados. |
| "The proxy has no database" | O proxy roda sem `DATABASE_URL`: não há virtual keys para ler. |
| "does not look like a LiteLLM proxy" | A URL aponta para outra coisa. Use `litellm_url` com a raiz do proxy. |
| "key rejected (401)" | Chave inválida, expirada ou bloqueada. |
| A aba Usage diz que não há histórico | A chave não tem `user_id`, o endpoint beta não existe nessa versão do LiteLLM, ou `show_usage` está desligado. |
| Não sei qual leitura falha | `/litellm ping` pergunta a cada endpoint e mostra status, tempo e o motivo. |
| `compare` diz que falta histórico | Ele precisa de 14 dias completos antes de hoje (28 para `compare 14`) e de gasto nos mais antigos. Uma chave nova só chega lá com o tempo. |
| O alerta diário atrasa | Ele vê o histórico do proxy, lido a cada 3 minutos (10 sem o `daily_alert`): o gasto de uma requisição só entra quando o proxy o grava. |
| Falta o "Pace" | O orçamento não tem teto, nada foi gasto ainda, `show_forecast` está desligado, ou o período mal começou e a chave não tem histórico de uso para a média. |

`/litellm debug` mostra o que o plugin resolveu.

## Desenvolvimento

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # testes (usam o motor do Claude Code)
tsc -p plugins/litellm-key                              # tipos (a pasta .claude-plugin/types é criada na primeira carga)
```

Para ver tudo funcionando sem um proxy de verdade (e `claude -p "/litellm check" < /dev/null` com ele, sem abrir a conversa):

```bash
python3 dev/mock-litellm.py --spend 41.37 &
ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 \
  claude --plugin-dir ./plugins/litellm-key
```

O mock tem cenários (`--scenario healthy|warning|over|expiring|blocked|nocap`) e opções para variar uma coisa de cada vez: `--port` (4000), `--spend`, `--max-budget`, `--expires-hours`, `--blocked`, `--delay`, `--fail-after`, `--models N` (quantos modelos o proxy lista, para experimentar o filtro), `--no-usage` (sem o endpoint de uso), `--no-health` (sem o `/health/readiness`) e `--today X` (quanto gastou o último dia do histórico, hoje: para experimentar o `daily_alert` e um dia fora do comum). Os 30 dias de uso são inventados, mas fecham: os dias do período atual somam o gasto do cenário.

Estrutura do plugin:

| Arquivo | Faz |
| --- | --- |
| `hooks/register.tsx` | Liga eventos, comando, timers, avisos, o relógio do painel e as preferências. |
| `hooks/litellm.ts` | Resolve credenciais, lê e normaliza as respostas. |
| `hooks/summary.ts` | Os medidores, alertas, fatos (ritmo, allowance, headroom, hoje), status line e os relatórios em texto. |
| `hooks/reports.ts` | Os relatórios dos comandos: `pace`, `day`, `compare`, o veredito do `check`, o `json` e o `ping`. |
| `hooks/args.ts` | Os argumentos dos comandos: períodos, dias (`yesterday`, `mon`, `10-03`) e o "Did you mean". |
| `hooks/forecast.ts` | O ritmo de gasto, a previsão, a allowance e a contagem da sessão. |
| `hooks/usage.ts` | Totais por período, tendência, a comparação entre períodos e a média recente do histórico. |
| `hooks/view.tsx` | O painel: cabeçalho, abas, rodapé e os estados vazios. |
| `hooks/tab-overview.tsx`, `tab-usage.tsx`, `tab-models.tsx`, `tab-details.tsx` | Uma aba cada. |
| `hooks/parts.tsx` | Peças compartilhadas: barras, sinais, linhas de fatos, seletor de período. |
| `hooks/chart.ts` | O gráfico de barras como texto, de gasto, requisições ou tokens. |
| `hooks/format.ts` | Os formatadores puros. |
| `types/index.d.ts` | O contrato do estado. |
| `tests/harness.ts` | O motor de mentira dos testes do plugin: sessão, relógio, rede e o painel montado em cada superfície. |

## Limites conhecidos

- `apiKeyHelper` não é lido (executar um comando do usuário ficou fora do escopo). Use `litellm_key`.
- O endpoint `/user/daily/activity` é beta no LiteLLM e pode mudar. Dele dependem o gráfico, o `compare`, o `day`, o headroom, o Today e o `daily_alert`.
- Numa execução `claude -p`, o Claude Code põe o nome do plugin (`litellm-key: `) no começo da primeira linha da resposta de um comando que não vem com ele. Os exemplos de [Em scripts](#em-scripts) o tiram com `sed`.
- O `exitCode` do `check` só vale numa execução `claude -p` cujo prompt é só o comando; numa sessão interativa ele é ignorado.
- O `Session` e a previsão são estimativas: valem para a chave toda, de qualquer cliente.
- O campo de filtro não existe no app mobile do Claude Code; lá a aba Models só lista.
- A API de plugins do Claude Code está em acesso antecipado e pode mudar entre versões.
