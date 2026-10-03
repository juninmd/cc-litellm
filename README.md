# cc-litellm

Plugin do Claude Code que mostra, sem sair do terminal, o que o seu proxy **LiteLLM** sabe sobre a **virtual key** que o Claude Code está usando: orçamento, gasto, limites, validade, modelos e uso dos últimos 7 dias.

Este repositório é um marketplace (`cc-litellm`) com um plugin: [`litellm-key`](plugins/litellm-key).

## O que você ganha

- **Status line** sob o prompt, sempre visível: `⚠ litellm-key: 83% · $41.37 of $50.00 · resets in 9d 2h (30d)`
- **Painel `/litellm`** com barras de uso, orçamentos de usuário e time, limites, validade, modelos e gasto dos últimos 7 dias. Atualiza sozinho.
- **Avisos** (toast) ao cruzar 80% (configurável), 95% e 100% do orçamento, quando a chave está para expirar (3 dias e 1 dia) e quando ela é bloqueada ou expira. Cada aviso aparece uma vez por janela de orçamento, mesmo entre sessões.
- **Comandos** para ver tudo como texto, listar modelos e diagnosticar a configuração.

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ claude-code-demo · sk-...2345  ● active                                      │
│ 127.0.0.1:4000 · via ANTHROPIC_AUTH_TOKEN                                    │
│                                                                              │
│ Budget                 █████████████████████████░░░░░ 83%                    │
│   $41.37 / $50.00 (83%) · $8.63 left · resets in 9d 3h (30d)                 │
│ Window 1h              ███████░░░░░░░░░░░░░░░░░░░░░░░ 22%                    │
│   $1.12 / $5.00 · resets in 38m                                              │
│ Model claude-opus-4-1  ███████████████████░░░░░░░░░░░ 62%                    │
│   $6.20 / $10.00 per 1d                                                      │
│ Team platform-eng      ███████████████████████████░░░ 91%                    │
│   $912.50 / $1,000.00 (91%) · $87.50 left · resets in 4d (30d)               │
│ User demo@example.com  █████████████░░░░░░░░░░░░░░░░░ 42%                    │
│   $63.40 / $150.00 (42%) · $86.60 left · resets in 9d 3h (30d)               │
│                                                                              │
│ Limits                 120 rpm · 400k tpm · 8 parallel                       │
│ Expires                in 40d                                                │
│ Models                 claude-haiku-4-5, claude-opus-4-1, claude-sonnet-4-5, │
│                        gpt-5 (4)                                             │
│ Lifetime               $128.87 across budget resets                          │
│ Last 7 days            ▃▄▁▆▇▄█ · $41.37 · 369 requests · 8.7M tokens         │
│                                                                              │
│ [ Refresh ] [ Copy ] [ Close ]  Updated 14:32:05 · every 60s                 │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Instalação

Requer um Claude Code recente: o plugin usa hooks de função (API em acesso antecipado), testados na 2.1.288.

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

Se a URL termina numa rota de pass-through (`/anthropic`, `/bedrock`, `/v1`…), o plugin também tenta a raiz do proxy. Cada chave só é usada com a URL a que pertence: as chaves do ambiente nunca vão para um `litellm_url` de outro host, e `LITELLM_PROXY_API_BASE` só se casa com `LITELLM_PROXY_API_KEY`.

Todas as opções são opcionais (o Claude Code avisa na instalação que elas "não foram definidas"; pode ignorar). Para mudar (`/plugin configure litellm-key@cc-litellm`, ou `claude plugin configure litellm-key@cc-litellm --values-stdin` com um JSON de strings):

| Opção | Padrão | Para quê |
| --- | --- | --- |
| `litellm_url` | vazio | Proxy fora do padrão (Bedrock/Vertex via LiteLLM, URL com prefixo). |
| `litellm_key` | vazio | Chave explícita. Guardada no armazenamento seguro, não no `settings.json`. |
| `refresh_seconds` | 60 | Intervalo de leitura (15 a 3600). Também lê de novo depois de cada turno, no máximo a cada 20 s. |
| `warn_percent` | 80 | Primeiro aviso de orçamento (também avisa em 95% e 100%). |
| `show_status_line` | sim | Linha fixa sob o prompt. |
| `show_related` | sim | Lê `/user/info` e `/team/info`: esses orçamentos também bloqueiam requisições. |
| `show_usage` | sim | Lê `/user/daily/activity` (endpoint beta do LiteLLM) para os 7 dias de uso. |

## Comandos

| Comando | Faz |
| --- | --- |
| `/litellm` | Abre o painel (e responde com uma linha de resumo). Sem tela, imprime o resumo. |
| `/litellm refresh` | Lê de novo agora. |
| `/litellm info` | Imprime o resumo completo no transcript. |
| `/litellm models` | Lista os modelos que a chave pode chamar. |
| `/litellm debug` | Mostra de onde saem URL e chave (a chave aparece só mascarada), o que foi tentado e o resultado. |
| `/litellm close` | Fecha o painel. |

No painel, com o foco nele (clique, ou `ctrl+x` `tab`): `r` atualiza, `c` copia o resumo, `q` fecha e as setas rolam. `Esc` também fecha (no prompt vazio).

## De onde vêm os dados

Só leituras (`GET`), sempre com a sua própria chave:

| Endpoint | Para quê |
| --- | --- |
| `/key/info` | Alias, gasto, orçamento e janelas, reset, limites, validade, status, modelos, orçamentos por modelo. A cada leitura. |
| `/user/info`, `/team/info` | Orçamento do usuário e do time da chave, se tiverem teto. A cada leitura. |
| `/v1/models` | Modelos realmente liberados. A cada 10 min. |
| `/user/daily/activity` | Gasto, requisições e tokens dos últimos 7 dias, desta chave. A cada 10 min. |

Cada requisição espera no máximo 4 s. Algo opcional que falhar (403, 404…) vira uma nota discreta no painel, nunca um erro. Se o proxy cair, o painel segue mostrando a última leitura boa, marcada como antiga.

## Privacidade

- A chave só viaja para o proxy que o Claude Code já usa, no header `Authorization` (ou `x-litellm-api-key`). Nunca em URL, log, toast, estado ou no armazenamento do plugin; mensagens de erro passam por um filtro que a mascara.
- O plugin guarda só os ids dos avisos já mostrados, para não repeti-los.
- `litellm-key` lê as variáveis `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` e `LITELLM_PROXY_API_KEY`, o bloco `env` do `settings.json` e faz requisições HTTP. `claude plugin validate plugins/litellm-key` lista tudo isso.

## Se algo não aparece

| Sintoma | Causa provável |
| --- | --- |
| Nada na status line e o toast diz "not configured" | Claude Code não está atrás de um proxy (`ANTHROPIC_BASE_URL` ausente ou `api.anthropic.com`). |
| "The proxy has no database record for this key" | É a master key, ou uma chave só do `config.yaml`. Só chaves criadas com `/key/generate` têm dados. |
| "The proxy has no database" | O proxy roda sem `DATABASE_URL`: não há virtual keys para ler. |
| "does not look like a LiteLLM proxy" | A URL aponta para outra coisa. Use `litellm_url` com a raiz do proxy. |
| "key rejected (401)" | Chave inválida, expirada ou bloqueada. |
| Falta o histórico de 7 dias | A chave não tem `user_id`, ou o endpoint beta não existe nessa versão do LiteLLM. |

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

Estrutura do plugin: `hooks/register.tsx` liga eventos, comando, timers e avisos; `hooks/litellm.ts` resolve credenciais, lê e normaliza as respostas; `hooks/summary.ts` e `hooks/view.tsx` montam o texto e o painel; `hooks/format.ts` tem os formatadores puros; `types/index.d.ts` é o contrato do estado.

## Limites conhecidos

- `apiKeyHelper` não é lido (executar um comando do usuário ficou fora do escopo). Use `litellm_key`.
- O endpoint `/user/daily/activity` é beta no LiteLLM e pode mudar.
- A API de plugins do Claude Code está em acesso antecipado e pode mudar entre versões.
