<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm: sua chave LiteLLM, orçamento e fallbacks dentro do Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Plugin do Claude Code" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 e v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="Versão 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <b>Português</b> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> Esta é uma tradução do README em inglês. Se houver divergências, a versão em inglês é a referência.

# cc-litellm

Um plugin do [Claude Code](https://code.claude.com) para quem acessa seus modelos por um **proxy [LiteLLM](https://docs.litellm.ai)**. Ele mostra o que o proxy sabe sobre a **chave virtual** que o Claude Code está usando (orçamento, gasto, limites, validade, modelos, uso dos últimos 30 dias) e, para admins, permite **criar e editar chaves, dar orçamento extra a alguém, bloquear uma chave e ler as cadeias de fallback do router** sem sair do terminal.

Este repositório é um marketplace de plugins (`cc-litellm`) com um único plugin: [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="O painel /litellm ao lado da conversa, contra um proxy LiteLLM real" width="92%">
</p>

## O que você ganha

| | | |
| --- | --- | --- |
| 👀 **Acompanhar** | **Linha de status** abaixo do prompt, sempre visível | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **Painel `/litellm`** | medidores dos orçamentos de chave, time, usuário e **membro do time**, o **role** do usuário, limites, validade, modelos, sparkline dos 7 dias, os **modelos que mais gastaram** na semana e uma previsão de **runway**; atualiza sozinho |
| | **Abas do painel** | **Usage** (gasto, requisições ou tokens por dia em barras, por 7, 14 ou 30 dias, um dia para escolher, como cada modelo se moveu), **Models** (quanto cada um gastou, um filtro, uma ordenação), **Details** (os campos da chave, versão e banco do LiteLLM, latência) |
| | **Orientação** | **Allowance** (quanto gastar por dia para durar até o reset), **Headroom** (quantas requisições ainda cabem no teto), **Today** contra o dia usual, **Session** (quanto esta sessão do Claude Code gastou, e em que ritmo) |
| | **Toasts** | aos 80% (configurável), 95% e 100%; chave prestes a expirar; chave bloqueada ou expirada; o gasto de hoje acima do seu **alerta diário**. Uma vez por janela de orçamento, mesmo entre sessões |
| | **Banner de orçamento estourado** | uma faixa vermelha acima do prompt que **permanece enquanto algum orçamento estiver estourado** (chave, usuário, time, janela ou modelo) e só some quando os números voltam ao normal |
| 📊 **Relatar** | **`/litellm pace`**, `usage`, `compare`, `day`, `status` | para onde o orçamento caminha, os dias e os modelos em tabelas, o que mudou contra os dias anteriores, um dia por modelo |
| | **`/litellm check`** | `OK`, `WARNING`, `CRITICAL` ou `UNKNOWN` **e o código de saída de uma execução `claude -p`** (0 a 3), para scripts e monitoramento |
| | **`/litellm json`** / `csv` | tudo em JSON, os dias em CSV; **`copy`** põe qualquer relatório na área de transferência, **`share`** o entrega ao Claude para perguntar sobre ele |
| 🛠️ **Gerenciar** *(admin)* | **`/litellm key new`** | cria uma chave virtual; o segredo vai para a sua **área de transferência, nunca para o histórico da conversa** |
| | **`/litellm grant`** | orçamento extra para uma chave, um usuário, um time ou uma organização, com prévia e confirmação |
| | **`/litellm key set`** / `reset-spend` | altera os modelos, limites, validade ou alias de uma chave; zera o contador de gasto dela |
| | **`/litellm key block`** / `unblock` | bloqueia (ou restaura) uma chave em uma linha |
| | **`/litellm org`** | o orçamento de uma organização, que uma chave virtual não consegue ler |
| | **`/litellm keys`** | lista chaves: as suas, as de um usuário, as de um time ou todas |
| | **`/litellm fallbacks`** | as cadeias de fallback do router (`cloud/auto → cloud/auto-long → …`), mais os fallbacks de janela de contexto |

Toda alteração mostra uma **prévia primeiro**, pergunta no **diálogo nativo** do Claude Code, aplica e depois **relê o resultado** no proxy.

<a id="install"></a>

## Instalação

Requer um Claude Code recente: o plugin usa hooks de função (uma API em acesso antecipado), testado na 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Para testar a partir de um clone, sem instalar: `claude --plugin-dir ./plugins/litellm-key`.

Se o Claude Code já fala com o LiteLLM, **não há nada a configurar**: o plugin lê a mesma URL e a mesma chave que o Claude Code usa. Os comandos de admin também pedem `litellm_admin_key` (veja [Comandos de admin](#admin-commands)).

## Um tour

### Acompanhe o orçamento

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code com a linha de status do litellm-key abaixo do prompt" width="92%">
</p>

`/litellm models` lista o que a chave pode chamar, `/litellm keys` as chaves que você possui:

<p align="center">
  <img src="../evidence/keys.png" alt="Saída de /litellm models e /litellm keys" width="92%">
</p>

### Olhe de perto: uso, modelos, detalhes

O painel tem quatro abas. Overview é o painel acima; **Usage** desenha os últimos 7, 14 ou 30 dias em barras, contando gasto, requisições ou tokens, deixa você escolher um dia para ver os modelos dele e diz qual modelo se moveu contra os dias anteriores:

```text
 1: Overview   2: Usage   3: Models  4: Details

 Spend per day (UTC)                7d   d: 14d  30d  m: chart: spend  v: CSV

 $11.4                                                               ██████
                                       ▁▁▁▁▁▁    ▇▇▇▇▇▇              ██████
                                       ██████    ██████              ██████
                   ▇▇▇▇▇▇              ██████    ██████    ▃▃▃▃▃▃    ██████
         ▅▅▅▅▅▅    ██████              ██████    ██████    ██████    ██████
    $0   ██████    ██████              ██████    ██████    ██████    ██████
           Wed       Thu       Fri       Sat       Sun       Mon       Tue
         $3.10     $5.40       ·       $7.90     $9.20     $4.40     $11.4

 Spend        $41.37 · $5.91/day
 Requests     369 · $0.112 each
 Failed       4 requests (1.1%)
 Peak day     $11.37 on Tue Oct 6
 Trend        ▲ 34% vs the 7 days before (full days)

 By model, last 7 days · ▲▼ vs the 7 before ─────────────────────────────────
 claude-sonnet-4-5  ▄▄▄▄▄▄▄▄▄▄▁▁▁▁▁▁▁▁▁▁  52%  $21.51 ▲ 34% · 189 requests
 claude-opus-4-1    ▄▄▄▄▄▄▁▁▁▁▁▁▁▁▁▁▁▁▁▁  28%  $11.58 ▲ 34% · 99 requests
```

**Models** lista o que a chave pode chamar com o que cada modelo gastou no período (ordene por gasto ou nome, e digite no filtro para estreitar uma lista longa); **Details** agrupa o que o proxy disse da chave, a versão e o estado do banco do LiteLLM e quanto tempo o `/key/info` levou. O período, a ordenação e o gráfico que você escolhe ficam guardados para a próxima vez, e `/litellm` abre o painel na aba em que você o deixou.

### Peça um relatório, ou entregue-o a um script

```text
/litellm pace
Budget     $41.37 / $50.00 (83%) · $8.63 left · resets in 9d 3h (30d)
Runway     out in 1d 6h at $6.75/day · resets in 9d 3h
Allowance  $0.95/day to last · 86% less than lately
Headroom   about 76 more requests at $0.112 each
Today      $11.37 · 102 requests · 2.2× the usual day ($5.21)
Session    +$0.40 since 03:03 (12m ago)
```

```bash
claude -p "/litellm check"; echo $?    # WARNING · 83% of budget … (saída 1)
claude -p "/litellm json" | jq .budget.percent
claude -p "/litellm csv 30" > usage.csv
```

### Veja o problema cedo e chame-o pelo nome

O plugin distingue chave bloqueada, chave expirada e chave errada, em vez de um *401* genérico:

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="86% do orçamento usado"><br><sub><b>86%</b>: toast de aviso e linha de status</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="Orçamento estourado"><br><sub><b>Orçamento estourado</b>: um banner que permanece até o orçamento normalizar</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="Chave bloqueada"><br><sub>Chave <b>bloqueada</b>, identificada como bloqueada</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="Chave expirada"><br><sub>Chave <b>expirada</b>, identificada como expirada</sub></td>
  </tr>
</table>

### Gere uma chave

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="Confirmação nativa antes de criar uma chave"><br><sub>Prévia e, em seguida, a confirmação nativa do Claude Code</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="A chave foi copiada para a área de transferência"><br><sub>O segredo vai para a área de transferência. O histórico da conversa só vê <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### Dê orçamento extra

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="Prévia de uma concessão de orçamento"><br><sub><code>$25 → $35 (+$10)</code>, o que já foi gasto e o que sobraria</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="A chave volta a ter folga depois da concessão"><br><sub>Aplicado e relido; a linha de status acompanha (101% → 79%)</sub></td>
  </tr>
</table>

### Quando o time limita cada membro

Um time pode limitar o quanto cada membro gasta (`team_member_budget`). O proxy recusa a requisição com o orçamento da própria chave em ordem, então o plugin lê o teto e o mostra como um medidor `Member`, e o banner de orçamento estourado o nomeia:

<p align="center">
  <img src="../evidence/member-cap.png" alt="O painel com um medidor Member acima do seu teto, o banner acima do prompt e a organização da chave nomeada" width="92%">
</p>

<sub>Captura feita contra `dev/mock-litellm.py --scenario member`. O proxy não informa a uma chave virtual o total de um membro, então o medidor conta <b>o gasto desta chave</b> e diz isso. Pode marcar a menos e, contra um teto que se reinicia, pode marcar a mais (um reinício zera o gasto do membro, não o da chave), então o banner só é acionado para um teto que nunca se reinicia. A organização da chave também é nomeada; o orçamento dela é só de admin, <code>/litellm org</code> o lê.</sub>

### Leia as cadeias de fallback

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Saiba quanto custa um modelo

<p align="center">
  <img src="../evidence/models-prices.png" alt="/litellm models com o preço por milhão de tokens de entrada e de saída e a janela de contexto" width="92%">
</p>

### E o proxy confirma

Tudo acima é a UI de admin real do LiteLLM v1.99.1 refletindo o que o plugin fez:

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="UI do LiteLLM, Virtual Keys"><br><sub>Chaves criadas e aumentadas a partir do Claude Code; uma expirada</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="UI do LiteLLM, Usage"><br><sub>O gasto aparece em Usage</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="UI do LiteLLM, Internal Users"><br><sub>O role do usuário no proxy (<code>internal_user</code>, <code>proxy_admin</code>) é o que a linha <b>Role</b> do painel mostra</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Comandos

| Comando | O que faz |
| --- | --- |
| `/litellm` | Abre o painel, na aba em que você o deixou (e responde com um resumo de uma linha). Sem tela: imprime essa aba como texto. |
| `/litellm tab <nome>` | Abre o painel em `overview`, `usage`, `models` ou `details` (ou 1 a 4). |
| `/litellm refresh` | Lê de novo agora. |
| `/litellm info` | Imprime o resumo completo no histórico da conversa. |
| `/litellm status` | Imprime a linha de status como texto. |
| `/litellm pace` | Para onde o orçamento caminha, quanto ele pode gastar por dia para durar, e o mesmo para o time e o usuário. |
| `/litellm usage [7\|14\|30]` | O gasto, as requisições e os tokens por dia em uma tabela, com os totais e os modelos. |
| `/litellm compare [7\|14]` | Os últimos dias completos contra o mesmo número de dias antes deles, no todo e modelo a modelo. |
| `/litellm day [quando]` | Um dia por modelo: `today`, `yesterday`, `2026-10-03`, `10-03` ou um dia da semana (`mon`). |
| `/litellm models [texto]` | Lista os modelos que esta chave pode chamar, com o preço por milhão de tokens e a janela de contexto; com um texto, só os que o têm no nome. |
| `/litellm check [warn%]` | `OK`, `WARNING`, `CRITICAL` ou `UNKNOWN`, e o código de saída de uma execução `claude -p`: 0, 1, 2, 3. Um orçamento acima do teto, ou uma chave que o proxy diz estar bloqueada, expirada ou rejeitada, é `CRITICAL`; um proxy que não responde é `UNKNOWN`. |
| `/litellm json` | Tudo o que o plugin sabe da chave em JSON (sem a chave, sem o hash). |
| `/litellm csv [7\|14\|30]` | Os dias em CSV. |
| `/litellm copy [o quê]` | Põe um relatório na área de transferência: `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` ou `json`. |
| `/litellm share [o quê]` | Entrega um relatório ao Claude, fora de vista, para que a próxima pergunta seja sobre ele. |
| `/litellm ping` | Tenta cada endpoint que o plugin lê, com o status e o tempo. |
| `/litellm debug` | Mostra de onde vêm a URL e as chaves (sempre mascaradas), o que foi tentado e o resultado. |
| `/litellm close` | Fecha o painel. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Lista chaves. Padrão: as chaves do seu próprio usuário. 🔐 |
| `/litellm key new <alias> [flags]` | Cria uma chave. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Bloqueia ou restaura uma chave. 🔐 |
| `/litellm key set <alias\|hash> [flags]` | Altera os modelos, limites, validade ou alias de uma chave. 🔐 |
| `/litellm key reset-spend <alias\|hash>` | Volta o contador de gasto de uma chave a zero. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | Adiciona orçamento. 🔐 |
| `/litellm org [id\|alias]` | O orçamento de uma organização; sem nome: a organização da própria chave, senão a lista. 🔐 |
| `/litellm fallbacks [model]` | Cadeias de fallback do router, opcionalmente só dos modelos que casam com um nome. 🔐 |

🔐 = comando de admin, veja abaixo. No painel (dê foco com um clique ou `ctrl+x` `tab`): `1` a `4` trocam de aba, `r` atualiza, `c` copia a aba em que você está, `q` fecha, as setas rolam; cada botão mostra a sua tecla (`Refresh (r)`, `Copy (c)`, `Close (q)`). Em Usage, `d` percorre 7, 14 e 30 dias, `m` gasto, requisições e tokens, `v` copia os dias em CSV; em Models, `s` ordena e `f` vai ao filtro. `Esc` também fecha o painel com o prompt vazio (em Models ele só sai do filtro).

Um comando digitado errado recebe um palpite (`Did you mean "usage"?`). Um comando que não consegue fazer o que foi pedido diz isso em uma frase, e os feitos para scripts (`check`, `json`, `csv`, `ping`) terminam com código de saída 3 quando não há o que informar.

O painel se adapta ao espaço: ao lado da conversa (tela cheia, a partir de 110 colunas) cada medidor ocupa duas linhas; acima do prompt, a partir de 122 colunas, os medidores viram uma tabela; em terminais mais estreitos ele mantém duas linhas por medidor, ou fica **compacto** se você ativar `compact_pane`. Ao lado da conversa, o painel ganha seções com título (`BUDGETS`, `KEY`, `LAST 7 DAYS`, `TOP MODELS`) e uma letra embaixo de cada dia da semana; `TOP MODELS` ordena os cinco modelos que mais gastaram, cada um com a sua parte da semana em uma barra. Um nome longo é cortado no meio, para que `claude-sonnet-4-5` e `claude-sonnet-4-6` continuem distintos. A cor nunca é o único sinal: `▲` marca um orçamento perto do teto, `✖` um que estourou, e um dia sem gasto é um `·`, nunca uma barra curta.

**Runway.** A linha `Runway` (no painel e em `/litellm info`) compara o ritmo dos últimos 7 dias (menos dias para uma chave mais nova que isso, nunca menos de um) com o teto: `lasts until the reset at $2.18/day`, ou `out in 2d 6h at $2.18/day · resets in 6d 12h` quando o orçamento acabaria antes. A linha de status acrescenta `out in 2d 6h at this pace` só quando isso está por vir: antes do reset, ou em até 3 dias para uma chave sem reset. Uma chave sem teto, uma que já estourou e uma cujo reset está vencido não recebem previsão.

<p align="center">
  <img src="../evidence/runway.png" alt="O painel de uma chave a caminho de esgotar: a linha Runway e a linha de status avisam, e a semana aparece dividida por modelo" width="92%">
</p>

<sub>Captura feita contra `dev/mock-litellm.py --scenario warning`: o laboratório local não tem uma semana de histórico em que basear a previsão.</sub>

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>

## Comandos de admin

Ler e alterar chaves exige um admin do proxy. Defina a opção **`litellm_admin_key`** (guardada no armazenamento de credenciais do seu SO, nunca em `settings.json`). Sem ela, o plugin tenta com a sua chave virtual e, se o proxy recusar, diz exatamente isso.

```text
/litellm key new ci-runner --budget 5 --every 7d --rpm 60 --user ana@example.com
/litellm key new batch --budget 20 --models cloud/auto,cloud/auto-long --expires 30d --team platform-eng
/litellm grant 10 --key claude-code-ana          # +$10 on top of the current budget
/litellm grant 200 --team platform-eng --set     # cap the team at exactly $200
/litellm grant 25 --org acme                     # +$25 on the organization (LiteLLM before 1.102, or enterprise)
/litellm key set ci-runner --models cloud/auto --rpm 30 --expires 14d
/litellm key set ci-runner --rpm none --expires never   # none removes a limit; --models all clears the list
/litellm key reset-spend ci-runner               # the budget counter back to $0
/litellm key block old-contractor
/litellm fallbacks cloud/auto
```

| Flag de `key new` | Significado |
| --- | --- |
| `--budget 10` | Limite de gasto em dólares. |
| `--every 30d` | Janela do orçamento: zera a cada 30 dias (`s m h d w mo`). |
| `--soft 8` | Limiar do alerta suave. |
| `--models a,b` | Modelos que a chave pode chamar (padrão: todos). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Limites de taxa. |
| `--expires 30d` | A chave deixa de funcionar depois desse tempo. |
| `--user ID` / `--team ID` | Quem é o dono (e cujo orçamento também se aplica). |

| Flag de `key set` | Significado |
| --- | --- |
| `--models a,b` / `--models all` | Substitui os modelos que a chave pode chamar (`all`: todos os modelos). |
| `--rpm N` / `--tpm N` / `--parallel N` | Define um limite; `none` o remove. |
| `--expires 30d` / `--expires never` | Expira depois desse tempo a partir de agora, ou nunca. |
| `--alias NEW` | Renomeia a chave. |

Um campo que você omite continua como está. A prévia mostra `before → after` para cada campo e avisa quando a chave é a que o Claude Code está usando.

Travas de segurança, em todo comando de admin:

- **Prévia primeiro.** `--dry-run` para aí; `--yes` pula a confirmação; do contrário, o diálogo nativo do Claude Code pergunta (**Apply** / **Cancel**).
- **Releitura.** Depois de um grant, o plugin relê o orçamento no proxy e informa o que está *lá*, não o que foi enviado.
- **O novo segredo nunca cai no histórico da conversa.** Ele vai para a área de transferência. Se a área de transferência não puder recebê-lo, a chave é **apagada de novo** (rollback) em vez de ficar guardada sem poder ser lida. `--reveal` o imprime, com um aviso de que agora ele está salvo no histórico.
- **Valores `sk-…` crus são recusados** como referência de chave: use um alias ou o hash da chave. Flags desconhecidas são erro, não são ignoradas em silêncio.
- **Números honestos.** O `grant` avisa quando o gasto já excede o novo orçamento, quando não há limite ao qual somar (use `--set`), quando nada mudaria e quando `--user` criaria um usuário que o proxy nunca viu.
- **A chave de admin** só é enviada ao proxy que já aceitou a chave da sua própria sessão, e nunca é impressa (os erros são mascarados).

O que *pode* ser dado como orçamento extra hoje, no LiteLLM v1.99.1 e v1.104.0: aumentar o orçamento de uma **chave**, de um **usuário** ou de um **time** (`--team`, que exige admin do proxy), como incremento ou como valor absoluto (`--set`). Um orçamento de **organização** (`--org`) funciona até a v1.101; a partir da v1.102 o proxy reserva as organizações às licenças enterprise e o plugin diz isso. Um aumento *temporário* de orçamento (`temp_budget_increase`) e orçamentos por modelo são exclusivos do enterprise no lado do proxy (veja [Orçamentos](#budgets-what-litellm-can-and-cannot-do)), então o plugin não os oferece, em vez de fingir.

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## Orçamentos: o que o LiteLLM pode e não pode fazer

Verificado ao vivo contra o LiteLLM v1.99.1 (proxy open source, sem licença); o limite por membro e as organizações também foram verificados na v1.104.0:

| Orçamento | Funciona? | Como |
| --- | --- | --- |
| Por **chave** (limite + janela de reset) | ✅ | `/litellm key new --budget 10 --every 30d`; aumente com `/litellm grant 5 --key NAME` |
| Por **usuário** | ✅ | `/litellm grant 5 --user ID` (vale para todas as chaves do usuário) |
| Por **time** | ✅ | `/litellm grant 50 --team NAME` (exige admin do proxy) |
| Por **membro** de um time (`team_member_budget`) | 👀 somente leitura | bloqueia as requisições do usuário nesse time (HTTP 429, 422 a partir da v1.104). O painel mostra o limite como `Member…`; defina-o na UI ou na API do LiteLLM. Uma chave virtual não consegue ler o total do membro, então o medidor conta o **gasto desta chave** e diz isso. Um reinício zera o gasto do membro, mas não o da chave, então o banner de orçamento estourado só é acionado para um teto que nunca se reinicia; contra um teto que se reinicia o medidor avisa, não afirma um bloqueio |
| Por **organização** | ✅ até a v1.101 · ⛔ enterprise a partir da v1.102 | bloqueia todas as chaves dela (HTTP 429). Uma chave virtual não consegue lê-lo: o painel nomeia a organização, `/litellm org` mostra o orçamento (admin), `grant --org` o aumenta |
| Várias janelas em uma chave (`budget_limits`, ex.: $5/hora + $50/mês) | somente leitura | exibidas como medidores `Window 1h` quando o proxy as tem |
| Por **modelo** em uma chave (`model_max_budget`) | ⛔ enterprise | o proxy responde *"You must have an enterprise license to set model_max_budget"*, também para `/budget/new`. Se o seu proxy tem a licença, o painel mostra esses medidores (`Model gpt-4o`) |
| Aumento temporário de orçamento (`temp_budget_increase`) | ⛔ enterprise | o proxy open source aceita o campo e nunca o aplica |

**Orçamento por modelo sem a licença:** crie uma chave por modelo, cada uma com seu próprio limite, por exemplo
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. A chave só pode chamar esse modelo e para em $5.

## Configuração

O plugin lê a mesma URL e a mesma chave que o Claude Code usa, nesta ordem (variáveis de processo primeiro, depois o bloco `env` do `settings.json`):

| O quê | De onde |
| --- | --- |
| URL | opção `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Chave | opção `litellm_key`, o header `x-litellm-api-key` em `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

Se a URL termina em uma rota pass-through (`/anthropic`, `/bedrock`, `/v1`…), o plugin também tenta a raiz do proxy. Uma chave só é usada com a URL a que pertence: chaves de ambiente nunca vão para um `litellm_url` em outro host, e `LITELLM_PROXY_API_BASE` só combina com `LITELLM_PROXY_API_KEY`.

Todas as opções são opcionais (o Claude Code avisa na instalação que elas estão "not set", ou seja, não definidas; isso é inofensivo). Altere com `/plugin configure litellm-key@cc-litellm`, ou com `claude plugin configure litellm-key@cc-litellm --values-stdin` passando um objeto JSON de strings.

| Opção | Padrão | Para |
| --- | --- | --- |
| `litellm_url` | vazio | Um proxy em local fora do padrão (Bedrock/Vertex via LiteLLM, URL com prefixo). |
| `litellm_key` | vazio | Uma chave explícita. 🔒 guardada no armazenamento de credenciais, não no `settings.json`. |
| `litellm_admin_key` | vazio | Chave de admin para `keys`, `key new/set/reset-spend/block/unblock`, `grant`, `org`, `fallbacks`. 🔒 mesmo armazenamento. Nunca é impressa. |
| `refresh_seconds` | 60 | Intervalo de leitura (15 a 3600). Também lê depois de cada turno, no máximo a cada 20 s. |
| `warn_percent` | 80 | Primeiro aviso de orçamento (também avisa em 95% e 100%). |
| `daily_alert` | 0 (desligado) | Avisa quando o gasto de hoje da chave chega a tantos dólares: um toast por dia, a linha de status e o painel. Com ele ligado, o histórico de uso é lido a cada 3 minutos. |
| `show_toasts` | sim | Os toasts que avisam do orçamento, do alerta diário, de uma chave que vai expirar e de um proxy que falha. Desligado, os avisos ficam na linha de status e no painel. |
| `show_status_line` | sim | A linha abaixo do prompt. |
| `show_related` | sim | Lê `/user/info` e `/team/info`: esses orçamentos também podem bloquear requisições. |
| `show_usage` | sim | Lê `/user/daily/activity` (um endpoint beta do LiteLLM): os últimos 30 dias de uso, em que se apoiam as abas Usage e Models, os relatórios, o runway e o alerta diário. |
| `compact_pane` | não | Painel compacto acima do prompt em terminais estreitos (74 a 121 colunas): um medidor por linha, informações lado a lado. |

## De onde vêm os dados

**Acompanhar** só lê (`GET`), sempre com a sua própria chave:

| Endpoint | Para |
| --- | --- |
| `/key/info` | Alias, gasto, orçamento e janelas, reset, limites, validade, status, modelos, orçamentos por modelo. A cada leitura. |
| `/user/info`, `/team/info` | Orçamento do usuário e do time da chave, e o limite por membro do time, quando há limite. A cada leitura. |
| `/v1/models` | Os modelos realmente permitidos. A cada 10 min. |
| `/model_group/info` | Preço por token e janela de contexto desses modelos (o proxy responde por todos os seus modelos; o plugin guarda os permitidos). A cada 10 min. |
| `/user/daily/activity` | Gasto, requisições, tokens e modelos dos últimos 30 dias, dia a dia. A cada 10 min. |
| `/health/readiness` | A versão do LiteLLM e se o banco dele está conectado. A cada 10 min; quando o proxy não diz, nada aparece, nem uma nota. |

As leituras marcadas como a cada 10 min acontecem a cada 3 minutos enquanto houver um `daily_alert`: o gasto de hoje é o que ele vigia.

**Gerenciar** só acontece quando você digita um comando de admin: `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/organization/info`, `/organization/list`, `/router/settings`, e `POST /key/generate`, `/key/delete` (somente rollback), `/key/block`, `/key/unblock`, `/key/update`, `/key/{hash}/reset_spend`, `/user/update`, `/team/update`, `PATCH /organization/update`.

Cada requisição espera no máximo 4 s (15 s para comandos de admin). Uma leitura opcional que falha (403, 404…) vira uma nota discreta no painel, nunca um erro. Se o proxy cair, o painel mantém a última leitura boa, marcada como desatualizada. O LiteLLM grava o gasto no banco em lotes, então os números ficam defasados em cerca de 10 segundos em relação a uma requisição.

## Privacidade e segurança

- Sua chave só viaja para o proxy que o Claude Code já usa, no header `Authorization` (ou `x-litellm-api-key`). Nunca em URL, log, toast, estado ou no armazenamento do plugin; as mensagens de erro passam por um filtro que a mascara.
- A chave de admin só é enviada à raiz do proxy que já aceitou a chave da sua sessão, e só quando você digita um comando de admin.
- O plugin guarda apenas os ids dos avisos que já exibiu, para não repeti-los.
- O `litellm-key` lê `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` e `LITELLM_PROXY_API_KEY`, o bloco `env` do `settings.json`, e faz requisições HTTP. `claude plugin validate plugins/litellm-key` lista tudo isso.

## Se algo não aparecer

| Sintoma | Causa provável |
| --- | --- |
| Nada na linha de status, o toast diz "not configured" | O Claude Code não está atrás de um proxy (`ANTHROPIC_BASE_URL` ausente ou `api.anthropic.com`). |
| "The proxy has no database record for this key" | É a master key, ou uma chave definida só no `config.yaml`. Só chaves criadas com `/key/generate` têm dados. |
| "The proxy has no database" | O proxy roda sem `DATABASE_URL`: não há chaves virtuais para ler. |
| "does not look like a LiteLLM proxy" | A URL aponta para outra coisa. Defina `litellm_url` como a raiz do proxy. |
| "key blocked" / "key expired" | Exatamente isso. Peça a um admin, ou rode `/litellm key unblock` em outra sessão. |
| "key rejected (401)" | Chave inválida. |
| Falta o histórico de uso | A chave não tem `user_id`, ou o endpoint beta não existe na sua versão do LiteLLM. |
| Um comando de admin diz que precisa de uma chave de admin | Defina `litellm_admin_key`. |
| Um comando de admin espera "until the proxy accepts this session's key" | Por design, a chave de admin só é enviada a um proxy que aceitou a sua própria chave. Corrija essa chave em outra sessão ou pela UI do LiteLLM. |

`/litellm debug` mostra o que o plugin resolveu.

## Teste com um LiteLLM de verdade no seu laptop

`dev/litellm` é um laboratório completo: LiteLLM v1.104.0 com Postgres 18 no Docker, então chaves virtuais, orçamentos e gasto são reais. O CI o sobe e roda o smoke test a cada mudança.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (o padrão) espelha uma configuração "auto" real: um grupo `cloud/auto` com pesos, uma cadeia de fallback, um fallback de janela de contexto e um modelo (`demo/always-429`) que sempre falha, para o router cair no fallback de forma visível. Nada sai da sua máquina.
- **O roteamento do seu próprio cluster:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` lê (somente leitura, via `kubectl`) o `config.yaml` do seu proxy e **apenas** as variáveis de provider que ele referencia, e grava um `config.cluster.yaml` + `.env` locais (no git-ignore: nunca os commite). Depois, `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`** é um proxy falso minúsculo para os estados da UI (`--scenario warning|blocked|…`), sem Docker.
- **`dev/evidence/`** é o harness que tirou todas as capturas de tela deste README: um Claude Code real num ConPTY, renderizado em PNG. Veja [`dev/evidence/README.md`](../../dev/evidence/README.md).

## Desenvolvimento

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Estrutura do plugin: `hooks/register.tsx` é o único arquivo que toca o `$` do Claude Code; ele monta as portas injetadas (`hooks/ports.ts`) e liga eventos, comandos, timers e toasts. Todo o resto são funções simples que recebem essas portas, então rodam nos testes sem subir o motor. `hooks/session.ts` é o ciclo de leitura (configuração, ticker, atualização forçada em fila); `hooks/credentials.ts` e `hooks/settings.ts` resolvem a chave e as opções; `hooks/litellm.ts` lê o proxy, `hooks/parsers.ts` e `hooks/json.ts` normalizam as respostas e `hooks/failures.ts` dá nome ao que deu errado; `hooks/alerts.ts` decide os toasts. `hooks/commands.ts` é a tabela de comandos do `/litellm` e `hooks/admin*.ts` os comandos de admin (`admin.ts` as leituras do proxy, `admin-targets.ts` as buscas de chave, usuário e time, `admin-writes.ts` as escritas, `admin-plan.ts` as prévias e os planos, `admin-link.ts` o vínculo da chave de admin com o proxy, `admin-commands.ts` o fluxo, `args.ts` o parser de argumentos). `hooks/exceeded.ts` e `hooks/band.tsx` são o banner de orçamento estourado; `hooks/summary.ts` monta o texto, `hooks/view.tsx` e `hooks/parts.tsx` o painel (indicador, títulos de seção, chip de status, linhas de medidor); `hooks/format.ts` tem os formatadores puros; `types/index.d.ts` é o contrato de estado. As abas são `hooks/tab-*.tsx` (`tab-overview.tsx` é o painel que existia antes das abas, `parts-tabs.tsx` as partes que elas dividem, `chart.ts` as barras); os relatórios são `hooks/report-*.ts`, `details.ts` e `probe.ts` (`/litellm ping`), sobre `history.ts` (os 30 dias, totais e comparações) e `guidance.ts` (allowance, headroom, today e a sessão). `hooks/commands-reports.ts` e `commands-share.ts` são os comandos que imprimem ou entregam um relatório.

## Limites conhecidos

- `apiKeyHelper` não é lido (executar um comando do usuário está fora do escopo). Use `litellm_key`.
- `/user/daily/activity` é beta no LiteLLM e pode mudar.
- Orçamentos por modelo (`model_max_budget`), aumentos temporários de orçamento e regeneração de chave são exclusivos do enterprise no lado do proxy, então não são oferecidos (veja [Orçamentos](#budgets-what-litellm-can-and-cannot-do)). Editar as cadeias de fallback exige `STORE_MODEL_IN_DB=True` no proxy, então `/litellm fallbacks` continua somente leitura.
- O orçamento de uma **organização** não vem na resposta da própria chave e uma chave virtual pode não poder lê-lo, então o painel só nomeia a organização; `/litellm org` o lê com uma chave de admin. A chave de admin continua sendo enviada só quando você digita um comando de admin, nunca no timer de atualização.
- O total de um **membro** do time não é informado a uma chave virtual: o medidor `Member` conta apenas o gasto desta chave, então pode marcar menos: se o usuário tem várias chaves no time, o proxy pode bloquear antes do que o medidor indica. Contra um teto que se reinicia ele também pode marcar mais (um reinício zera o gasto do membro, não o da chave), então nesse caso ele avisa e o banner fica em silêncio.
- O histórico de uso lê uma página das linhas de atividade do proxy; quando há mais, o painel avisa que é parcial. Os dias são UTC, como o proxy conta; o de hoje ainda está correndo, então as comparações o deixam de fora.
- A linha **Session** conta quanto o gasto da chave cresceu desde a primeira leitura desta sessão do Claude Code. Ela não distingue o gasto desta sessão do de outra sessão com a mesma chave.
- O banner de orçamento estourado é desenhado nas superfícies de terminal e desktop (o Claude Code só oferece a faixa nelas); nas demais, a linha de status e o painel avisam.
- O `⚠` antes da linha de status é desenhado pelo Claude Code em toda entrada de status de plugin; ele não significa que a chave tem problema (o texto é que diz).
- A API de plugins do Claude Code é de acesso antecipado e pode mudar entre versões.

## Licença

[MIT](../../LICENSE).

## Outros idiomas

[English](../../README.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
