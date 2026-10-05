# cc-litellm

Plugin do Claude Code que mostra, sem sair do terminal, o que o seu proxy **LiteLLM** sabe sobre a **virtual key** que o Claude Code está usando: orçamento, ritmo de gasto, limites, validade, modelos e uso dos últimos 30 dias.

Este repositório é um marketplace (`cc-litellm`) com um plugin: [`litellm-key`](plugins/litellm-key).

## O que você ganha

- **Status line** sob o prompt, sempre visível, com um medidor e a previsão: `⚠ litellm-key: ▰▰▰▰▰▱ 83% of budget · $41.37 of $50.00 · resets in 9d 2h (30d) · empty in 4d 8h`
- **Painel `/litellm` em quatro abas**, que atualiza sozinho:
  - **Overview**: barras de uso (chave, janelas, modelos, time e usuário), o tempo do período ao lado do orçamento, alertas, ritmo de gasto, previsão de quando o orçamento acaba e quanto foi gasto nesta sessão.
  - **Usage**: gráfico de barras do gasto por dia (7, 14 ou 30 dias), detalhe de um dia por modelo, requisições, tokens (entrada, saída e cache), dia de pico, tendência e a divisão por modelo. Copia os dias como CSV.
  - **Models**: os modelos da chave com o gasto de cada um, filtro por texto, ordem por gasto ou nome e os tetos por modelo.
  - **Details**: tudo o que o proxy disse sobre a chave (hash, tipo, usuário, time, datas, limites) e como a leitura foi feita, com link para o painel do LiteLLM.
- **Previsão de gasto**: o ritmo do período até agora, até quanto o orçamento chega no reset nesse ritmo e quando ele acaba, se for antes dele.
- **Avisos** (toast) ao cruzar 80% (configurável), 95% e 100% do orçamento da chave, quando o ritmo vai estourá-lo antes do reset, quando a chave está para expirar (3 dias e 1 dia) e quando ela é bloqueada ou expira. Cada aviso aparece uma vez, mesmo entre sessões; os de orçamento e de ritmo voltam a cada novo período do orçamento. Os orçamentos de janela, de modelo, do time e do usuário aparecem no painel, sem toast.
- **Comandos** para ver tudo como texto, listar modelos, imprimir o uso por dia e diagnosticar a configuração.

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
│   $1.12 / $5.00 · resets in 37m                                              │
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
│ Limits                 120 rpm · 400k tpm · 8 parallel                       │
│ Expires                in 39d                                                │
│ Models                 claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5, │
│                        gpt-5 (4)                                             │
│ Lifetime               $128.87 across budget resets                          │
│ Last 7 days            ▂▅▅▄▃▆█ · $18.53 · 164 requests · 3.9M tokens         │
│ Session                nothing spent since 14:31 (1m ago)                    │
│                                                                              │
│ 127.0.0.1:4000 · via ANTHROPIC_AUTH_TOKEN                                    │
│ Updated 14:32:05 (12s ago) · every 60s                                       │
│ ctrl+x tab, or a click, gives the pane the keyboard                          │
╰──────────────────────────────────────────────────────────────────────────────╯
```

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ claude-code-demo · sk-...2345  ● active       [ Refresh ] [ Copy ] [ Close ] │
│ 1: Overview   2: Usage   3: Models  4: Details                               │
│                                                                              │
│ Spend per day (UTC)                                 7d   d: 14d  30d  v: CSV │
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
│ By model, last 7 days ────────────────────────────────────────────────────── │
│ claude-sonnet-4-5  █████████████▊░░░░░░░░░░  58%  $10.66 · 89 requests       │
│ claude-opus-4-1    ██████▊░░░░░░░░░░░░░░░░░  28%  $5.24 · 43 requests        │
│ claude-haiku-4-5   ██▎░░░░░░░░░░░░░░░░░░░░░   9%  $1.69 · 11 requests        │
│ gpt-5              █▎░░░░░░░░░░░░░░░░░░░░░░   5%  $0.94 · 5 requests         │
│                                                                              │
│ 127.0.0.1:4000 · via ANTHROPIC_AUTH_TOKEN                                    │
│ Updated 14:32:05 (12s ago) · every 60s                                       │
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
| `/litellm usage [7\|14\|30]` | Imprime o gasto por dia, com totais, tokens e a divisão por modelo. |
| `/litellm models` | Lista os modelos que a chave pode chamar. |
| `/litellm debug` | Mostra de onde saem URL e chave (a chave aparece só mascarada), o que foi tentado e o resultado. |
| `/litellm close` | Fecha o painel. |
| `/litellm help` | Lista os comandos. |

Há apelidos: `pane` e `open` para o painel, `view` para `tab`, `hide` para `close`, `reload` e `r` para `refresh`, `text` e `summary` para `info`, `diag` e `doctor` para `debug`.

## Teclado e mouse

Com o foco no painel (clique nele, ou `ctrl+x` `tab`), o rodapé lembra as teclas:

| Tecla | Faz |
| --- | --- |
| `1` a `4` | Troca de aba (Overview, Usage, Models, Details). |
| `r` | Atualiza. |
| `c` | Copia o que a aba mostra: o resumo, o relatório de uso, a lista de modelos (inteira, sem o filtro nem a ordem) ou os detalhes. Um aviso confirma o que foi copiado. |
| `q` | Fecha. |
| `d` | Usage e Models: passa para o próximo período (7, 14, 30 dias). Os períodos também se escolhem com um clique. |
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
- **Session**: quanto a chave gastou desde a primeira leitura, com o Claude Code aberto, somando o gasto mesmo quando o orçamento reinicia no meio do caminho. Vale para a chave toda: se outros clientes a usam, o gasto deles entra.
- **Usage**: os dias do gráfico, o dia de pico e a tendência são em UTC, como o proxy conta (as datas de Details também); "Updated" e "Session" usam o relógio local. A tendência compara os últimos dias completos com o mesmo número de dias antes deles (o dia de hoje fica de fora, porque ainda não acabou), então só aparece quando o histórico tem o dobro: não com 30 dias.
- **Failed**, na aba Usage, conta as requisições que falharam; **Soft limit**, em Overview, é o aviso de orçamento que o proxy tem configurado, quando há.

## De onde vêm os dados

Só leituras (`GET`), sempre com a sua própria chave:

| Endpoint | Para quê |
| --- | --- |
| `/key/info` | Alias, gasto, orçamento e janelas, reset, limites, validade, status, modelos, orçamentos por modelo. A cada leitura. |
| `/user/info`, `/team/info` | Orçamento do usuário e do time da chave, se a chave tiver um e se ele tiver teto. A cada leitura. |
| `/v1/models` | Modelos realmente liberados. A cada 10 min nas leituras do relógio. |
| `/user/daily/activity` | Gasto, requisições e tokens dos últimos 30 dias, por dia e por modelo, desta chave (pelo hash que o `/key/info` devolve; sem ele, do usuário). A cada 10 min nas leituras do relógio. |

As leituras do relógio e as de depois de um turno só refazem os modelos e o uso a cada 10 minutos; a primeira, o botão Refresh, `/litellm refresh` e qualquer comando que encontre a leitura com mais de 15 s leem tudo de novo. Cada requisição espera no máximo 4 s. Algo opcional que falhar (403, 404…) vira uma nota discreta no painel, nunca um erro, e fica o último dado bom. Se o proxy cair (rede, 5xx ou 429), o painel segue mostrando a última leitura boa, marcada como antiga; uma chave recusada (401, 403), sem registro (404) ou sem banco de dados esvazia o painel e diz o motivo.

## Privacidade

- A chave só viaja para o proxy que o Claude Code já usa, no header `Authorization` (ou `x-litellm-api-key`). Nunca em URL, log, toast, estado ou no armazenamento do plugin; mensagens de erro passam por um filtro que a mascara.
- O plugin guarda só os ids dos avisos já mostrados, para não repeti-los, e a sua preferência de período e de ordem.
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
| Falta o "Pace" | O orçamento não tem teto, nada foi gasto ainda, `show_forecast` está desligado, ou o período mal começou e a chave não tem histórico de uso para a média. |

`/litellm debug` mostra o que o plugin resolveu.

## Desenvolvimento

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # testes (usam o motor do Claude Code)
tsc -p plugins/litellm-key                              # tipos (a pasta .claude-plugin/types é criada na primeira carga)
```

Para ver tudo funcionando sem um proxy de verdade:

```bash
python3 dev/mock-litellm.py --spend 41.37 &
ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 \
  claude --plugin-dir ./plugins/litellm-key
```

O mock tem cenários (`--scenario healthy|warning|over|expiring|blocked|nocap`) e opções para variar uma coisa de cada vez: `--port` (4000), `--spend`, `--max-budget`, `--expires-hours`, `--blocked`, `--delay`, `--fail-after`, `--models N` (quantos modelos o proxy lista, para experimentar o filtro) e `--no-usage` (sem o endpoint de uso). Os 30 dias de uso são inventados, mas fecham: os dias do período atual somam o gasto do cenário.

Estrutura do plugin:

| Arquivo | Faz |
| --- | --- |
| `hooks/register.tsx` | Liga eventos, comando, timers, avisos, o relógio do painel e as preferências. |
| `hooks/litellm.ts` | Resolve credenciais, lê e normaliza as respostas. |
| `hooks/summary.ts` | Os medidores, alertas, fatos, status line e os relatórios em texto. |
| `hooks/forecast.ts` | O ritmo de gasto, a previsão e a contagem da sessão. |
| `hooks/usage.ts` | Totais por período, tendência e a média recente do histórico. |
| `hooks/view.tsx` | O painel: cabeçalho, abas, rodapé e os estados vazios. |
| `hooks/tab-overview.tsx`, `tab-usage.tsx`, `tab-models.tsx`, `tab-details.tsx` | Uma aba cada. |
| `hooks/parts.tsx` | Peças compartilhadas: barras, sinais, linhas de fatos, seletor de período. |
| `hooks/chart.ts` | O gráfico de barras como texto. |
| `hooks/format.ts` | Os formatadores puros. |
| `types/index.d.ts` | O contrato do estado. |

## Limites conhecidos

- `apiKeyHelper` não é lido (executar um comando do usuário ficou fora do escopo). Use `litellm_key`.
- O endpoint `/user/daily/activity` é beta no LiteLLM e pode mudar.
- O `Session` e a previsão são estimativas: valem para a chave toda, de qualquer cliente.
- O campo de filtro não existe no app mobile do Claude Code; lá a aba Models só lista.
- A API de plugins do Claude Code está em acesso antecipado e pode mudar entre versões.
