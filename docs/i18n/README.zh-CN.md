<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm：在 Claude Code 中查看你的 LiteLLM 密钥、预算与回退链" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude Code 插件" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="217 项测试通过" src="https://img.shields.io/badge/tests-217%20passing-22c55e?style=for-the-badge">
  <img alt="版本 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.pt-BR.md">Português</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <b>简体中文</b> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> 本文是英文版 README 的翻译。如与英文版存在出入，以[英文版](../../README.md)为准。

# cc-litellm

这是一个 [Claude Code](https://code.claude.com) 插件，面向通过 **[LiteLLM](https://docs.litellm.ai) 代理** 访问模型的用户。它会显示代理所掌握的、Claude Code 当前所用**虚拟密钥**的信息（预算、花费、限额、有效期、可用模型、近 7 天用量）；对管理员而言，还能在不离开终端的情况下 **创建密钥、为他人追加预算、禁用密钥，并查看路由器的回退链**。

本仓库是一个插件市场（`cc-litellm`），目前只有一个插件：[`litellm-key`](../../plugins/litellm-key)。

<p align="center">
  <img src="../evidence/pane.png" alt="/litellm 面板显示在对话旁边，连接的是真实的 LiteLLM 代理" width="92%">
</p>

## 功能一览

| | | |
| --- | --- | --- |
| 👀 **监控** | **状态栏**，位于输入框下方，始终可见 | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm` 面板** | 密钥、团队和用户预算的用量条，用户**角色**、限额、有效期、可用模型、7 天迷你趋势图；自动刷新 |
| | **Toast 提示** | 预算用到 80%（可配置）、95%、100% 时；密钥即将过期；密钥被禁用或已过期。每个预算周期只提醒一次，跨会话同样如此 |
| | **超预算横幅** | 输入框上方的红色横条，**只要有预算被用尽就会一直显示**（密钥、用户、团队、预算窗口或模型），数值恢复正常后才消失 |
| 🛠️ **管理** *(管理员)* | **`/litellm key new`** | 创建虚拟密钥；密钥明文会写入**剪贴板，绝不进入对话记录** |
| | **`/litellm grant`** | 为密钥、用户或团队追加预算，附带预览与确认 |
| | **`/litellm key block`** / `unblock` | 一行命令禁用（或恢复）一个密钥 |
| | **`/litellm keys`** | 列出密钥：你自己的、某位用户的、某个团队的，或全部 |
| | **`/litellm fallbacks`** | 路由器的回退链（`cloud/auto → cloud/auto-long → …`），以及上下文窗口回退 |

每次变更都会先**展示预览**，再通过 Claude Code 的**原生对话框**请你确认，然后执行，最后从代理**回读结果**。

<a id="install"></a>
## 安装

需要较新版本的 Claude Code：插件使用了函数钩子（一项早期访问 API），已在 2.1.289 上测试。

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

想不安装、直接从本地克隆试用：`claude --plugin-dir ./plugins/litellm-key`。

如果 Claude Code 已经在使用 LiteLLM，则**无需任何配置**：插件会读取 Claude Code 所用的同一个 URL 和密钥。管理员命令还需要 `litellm_admin_key`（见[管理员命令](#admin-commands)）。

## 快速导览

### 盯住预算

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code 输入框下方的 litellm-key 状态栏" width="92%">
</p>

`/litellm models` 列出该密钥可调用的模型，`/litellm keys` 列出你名下的密钥：

<p align="center">
  <img src="../evidence/keys.png" alt="/litellm models 与 /litellm keys 的输出" width="92%">
</p>

### 及早发现问题，并说清是什么问题

插件能分清密钥是被禁用、已过期，还是填错了，而不是笼统地报一个 *401*：

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="预算已用 86%"><br><sub><b>86%</b>：预警 toast 与状态栏</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="超预算"><br><sub><b>超预算</b>：横幅会一直显示，直到预算恢复正常</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="密钥已被禁用"><br><sub><b>已禁用</b>的密钥，明确标示为已禁用</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="密钥已过期"><br><sub><b>已过期</b>的密钥，明确标示为已过期</sub></td>
  </tr>
</table>

### 生成密钥

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="创建密钥前的原生确认框"><br><sub>先预览，再由 Claude Code 原生对话框确认</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="密钥已复制到剪贴板"><br><sub>密钥明文进入剪贴板，对话记录里只会出现 <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### 追加预算

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="预算追加的预览"><br><sub><code>$25 → $35 (+$10)</code>，显示已花费多少、追加后还剩多少</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="追加预算后，密钥重新有了余量"><br><sub>已应用并回读；状态栏随之更新（101% → 79%）</sub></td>
  </tr>
</table>

### 查看回退链

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### 代理端的数据也一致

以上全部来自真实的 LiteLLM v1.99.1 管理界面，它反映的正是插件所做的操作：

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="LiteLLM UI，Virtual Keys"><br><sub>在 Claude Code 中创建并调高额度的密钥；其中一个已过期</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="LiteLLM UI，Usage"><br><sub>花费会出现在 Usage 页</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="LiteLLM UI，Internal Users"><br><sub>用户在代理中的角色（<code>internal_user</code>、<code>proxy_admin</code>）就是面板 <b>Role</b> 行显示的内容</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## 命令

| 命令 | 作用 |
| --- | --- |
| `/litellm` | 打开面板（并以一行摘要作答）。无界面环境下：直接打印摘要。 |
| `/litellm refresh` | 立即重新读取。 |
| `/litellm info` | 在对话记录中打印完整摘要。 |
| `/litellm models` | 列出该密钥可调用的模型。 |
| `/litellm debug` | 显示 URL 和密钥的来源（始终做掩码处理）、尝试过什么、结果如何。 |
| `/litellm close` | 关闭面板。 |
| `/litellm keys [--user ID \| --team ID \| --all]` | 列出密钥。默认：你自己所属用户的密钥。🔐 |
| `/litellm key new <alias> [flags]` | 创建密钥。🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | 禁用或恢复密钥。🔐 |
| `/litellm grant <amount> [--key \| --user \| --team] [--set]` | 追加预算。🔐 |
| `/litellm fallbacks [model]` | 路由器的回退链，可只看名称匹配的模型。🔐 |

🔐 = 管理员命令，见下文。在面板中（点击面板，或按 `ctrl+x` `tab` 获得焦点）：`r` 刷新，`c` 复制摘要，`q` 关闭，方向键滚动。输入框为空时，`Esc` 同样可以关闭面板。

面板会随可用空间自适应：位于对话旁边时（全屏，宽度 110 列起），每个用量条占两行；位于输入框上方时，从 122 列起，用量条会变成一张表；在更窄的终端里，每个用量条仍占两行，如果启用了 `compact_pane`，则切换为**紧凑**布局。

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>
## 管理员命令

读取和修改密钥需要代理管理员权限。请设置 **`litellm_admin_key`** 选项（存放在操作系统的凭据存储中，绝不会写入 `settings.json`）。不设置时，插件会先用你的虚拟密钥尝试，如果代理拒绝，就会明确告诉你这一点。

```text
/litellm key new ci-runner --budget 5 --every 7d --rpm 60 --user ana@example.com
/litellm key new batch --budget 20 --models cloud/auto,cloud/auto-long --expires 30d --team platform-eng
/litellm grant 10 --key claude-code-ana          # +$10 on top of the current budget
/litellm grant 200 --team platform-eng --set     # cap the team at exactly $200
/litellm key block old-contractor
/litellm fallbacks cloud/auto
```

| `key new` 参数 | 含义 |
| --- | --- |
| `--budget 10` | 花费上限，单位为美元。 |
| `--every 30d` | 预算窗口：每 30 天重置一次（`s m h d w mo`）。 |
| `--soft 8` | 软预警阈值。 |
| `--models a,b` | 该密钥可调用的模型（默认：全部）。 |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | 速率限制。 |
| `--expires 30d` | 经过这么长时间后，密钥失效。 |
| `--user ID` / `--team ID` | 密钥归属方（该方的预算同样适用）。 |

每条管理员命令都有这些安全护栏：

- **先预览。** `--dry-run` 到预览为止；`--yes` 跳过确认；否则由 Claude Code 的原生对话框询问（**Apply** / **Cancel**）。
- **回读。** 追加预算后，插件会从代理重新读取预算，报告的是代理里*实际存在*的值，而不是它发出去的值。
- **新密钥的明文绝不会进入对话记录。** 它会写入剪贴板。如果剪贴板写不进去，密钥会被**再次删除**（回滚），而不是留下一个读不出来的密钥。`--reveal` 会把它打印出来，并警告该密钥现已保存在对话记录中。
- **拒绝裸 `sk-…` 值**作为密钥引用：请使用别名或密钥哈希。未知参数会报错，而不是被悄悄忽略。
- **数字如实呈现。** `grant` 会明确指出以下情形：花费已超过新预算、没有上限可供叠加（请用 `--set`）、没有任何变化，以及 `--user` 将创建一个代理从未见过的用户。
- **管理员密钥**只会发送给已接受你当前会话自身密钥的那个代理，并且绝不打印（错误信息会做脱敏）。

目前在 LiteLLM v1.99.1 上，*能够*追加的预算有：调高**密钥**预算、**用户**预算或**团队**预算（`--team`，需要代理管理员），可按增量或绝对值（`--set`）调整。*临时*预算上调（`temp_budget_increase`）和按模型设置的预算在代理端属于企业版专属功能（见[预算](#budgets-what-litellm-can-and-cannot-do)），因此插件不提供这些功能，而不是假装支持。

<a id="budgets-what-litellm-can-and-cannot-do"></a>
## 预算：LiteLLM 能做什么，不能做什么

已针对 LiteLLM v1.99.1（开源版代理，无许可证）实测：

| 预算 | 是否可用 | 方式 |
| --- | --- | --- |
| 按**密钥**（上限 + 重置窗口） | ✅ | `/litellm key new --budget 10 --every 30d`；用 `/litellm grant 5 --key NAME` 调高 |
| 按**用户** | ✅ | `/litellm grant 5 --user ID`（对该用户名下的所有密钥生效） |
| 按**团队** | ✅ | `/litellm grant 50 --team NAME`（需要代理管理员） |
| 同一密钥上的多个窗口（`budget_limits`，例如每小时 $5 + 每月 $50） | 只读 | 代理里存在时，显示为 `Window 1h` 用量条 |
| 密钥上按**模型**设置（`model_max_budget`） | ⛔ 企业版 | 代理返回 *"You must have an enterprise license to set model_max_budget"*，`/budget/new` 同样如此。如果你的代理有许可证，面板会显示这些用量条（`Model gpt-4o`） |
| 临时预算上调（`temp_budget_increase`） | ⛔ 企业版 | 开源版代理会接受该字段，但从不执行 |

**无许可证时的按模型预算**：为每个模型各建一个密钥，各设各的上限，例如
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`。该密钥只能调用那一个模型，花到 $5 就会停。

## 配置

插件读取 Claude Code 所用的同一个 URL 和密钥，读取顺序如下（先是进程环境变量，再是 `settings.json` 的 `env` 块）：

| 项目 | 来源 |
| --- | --- |
| URL | 选项 `litellm_url`、`ANTHROPIC_BASE_URL`、`LITELLM_PROXY_API_BASE` |
| 密钥 | 选项 `litellm_key`、`ANTHROPIC_CUSTOM_HEADERS` 中的 `x-litellm-api-key` 头、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`LITELLM_PROXY_API_KEY` |

如果 URL 以透传路由结尾（`/anthropic`、`/bedrock`、`/v1`…），插件还会尝试代理根路径。密钥只会配合它所属的 URL 使用：来自环境变量的密钥绝不会发往另一台主机上的 `litellm_url`，而 `LITELLM_PROXY_API_BASE` 只与 `LITELLM_PROXY_API_KEY` 配对。

所有选项都是可选的（安装时 Claude Code 会提示它们 "not set"，这是无害的）。可以用 `/plugin configure litellm-key@cc-litellm` 修改，也可以用 `claude plugin configure litellm-key@cc-litellm --values-stdin` 传入一个值均为字符串的 JSON 对象。

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `litellm_url` | 空 | 代理位于非默认位置时使用（经 LiteLLM 的 Bedrock/Vertex，或带前缀的 URL）。 |
| `litellm_key` | 空 | 显式指定密钥。🔒 存放在凭据存储中，不写入 `settings.json`。 |
| `litellm_admin_key` | 空 | 供 `keys`、`key new/block/unblock`、`grant`、`fallbacks` 使用的管理员密钥。🔒 存储方式相同。绝不打印。 |
| `refresh_seconds` | 60 | 读取间隔（15 到 3600）。每轮对话结束后也会读取，最多每 20 秒一次。 |
| `warn_percent` | 80 | 首次预算预警（用到 95% 和 100% 时也会预警）。 |
| `show_status_line` | `yes` | 输入框下方的那一行状态栏。 |
| `show_related` | `yes` | 读取 `/user/info` 和 `/team/info`：这些预算同样可能拦截请求。 |
| `show_usage` | `yes` | 读取 `/user/daily/activity`（LiteLLM 的一个 beta 端点）以获得 7 天用量。 |
| `compact_pane` | `no` | 在窄终端（74 到 121 列）中使用输入框上方的紧凑面板：每行一个用量条，各项信息并排显示。 |

## 数据来源

**监控**只读取（`GET`），并且始终使用你自己的密钥：

| 端点 | 用途 |
| --- | --- |
| `/key/info` | 别名、花费、预算与窗口、重置时间、限额、有效期、状态、模型、按模型预算。每次读取都会请求。 |
| `/user/info`、`/team/info` | 密钥所属用户和团队的预算（设有上限时）。每次读取都会请求。 |
| `/v1/models` | 实际允许使用的模型。每 10 分钟一次。 |
| `/user/daily/activity` | 最近 7 天的花费、请求数和 token 数。每 10 分钟一次。 |

**管理**只会在你输入管理员命令时发生：`GET /key/list`、`/key/info`、`/user/info`、`/team/info`、`/v2/team/list`、`/router/settings`，以及 `POST /key/generate`、`/key/delete`（仅用于回滚）、`/key/block`、`/key/unblock`、`/key/update`、`/user/update`、`/team/update`。

每个请求最多等待 4 秒（管理员命令为 15 秒）。可选的读取失败时（403、404…），只会在面板里留下一条不起眼的提示，绝不会报错。代理宕机时，面板会保留最近一次成功的读数，并标记为已过期。LiteLLM 是分批把花费写入数据库的，因此数字会比请求滞后约 10 秒。

## 隐私与安全

- 你的密钥只会发送到 Claude Code 已在使用的代理，放在 `Authorization`（或 `x-litellm-api-key`）请求头中。绝不会出现在 URL、日志、toast、状态或插件存储中；错误信息会经过一道过滤器，把密钥掩码。
- 管理员密钥只会发送到已接受你会话密钥的代理根路径，并且仅在你输入管理员命令时发送。
- 插件只存储已展示过的预警的 id，以避免重复提醒。
- `litellm-key` 会读取 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_CUSTOM_HEADERS`、`LITELLM_PROXY_API_BASE` 和 `LITELLM_PROXY_API_KEY`，以及 `settings.json` 的 `env` 块，并会发出 HTTP 请求。`claude plugin validate plugins/litellm-key` 会列出这一切。

## 某些内容没有显示时

| 现象 | 可能原因 |
| --- | --- |
| 状态栏里什么都没有，toast 提示 "not configured" | Claude Code 没有走代理（缺少 `ANTHROPIC_BASE_URL`，或指向 `api.anthropic.com`）。 |
| "The proxy has no database record for this key" | 这是主密钥，或者是只写在 `config.yaml` 里的密钥。只有通过 `/key/generate` 创建的密钥才有数据。 |
| "The proxy has no database" | 代理运行时没有 `DATABASE_URL`：不存在可读取的虚拟密钥。 |
| "does not look like a LiteLLM proxy" | URL 指向了别的服务。请把 `litellm_url` 设为代理根路径。 |
| "key blocked" / "key expired" | 就是字面意思。请联系管理员，或在另一个会话里运行 `/litellm key unblock`。 |
| "key rejected (401)" | 密钥无效。 |
| 缺少 7 天历史 | 该密钥没有 `user_id`，或者你的 LiteLLM 版本没有这个 beta 端点。 |
| 管理员命令提示需要管理员密钥 | 请设置 `litellm_admin_key`。 |
| 管理员命令一直等待，提示 "until the proxy accepts this session's key" | 按设计如此：管理员密钥只会发送给已接受你自身密钥的代理。请在另一个会话或 LiteLLM UI 中修复那个密钥。 |

`/litellm debug` 会显示插件最终解析出的内容。

## 在本机用真实的 LiteLLM 试一试

`dev/litellm` 是一套完整的实验环境：LiteLLM v1.99.1 加 Docker 中的 Postgres，所以虚拟密钥、预算和花费都是真实的。

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`**（默认）模拟真实的 "auto" 配置：带权重的 `cloud/auto` 分组、一条回退链、一个上下文窗口回退，以及一个始终失败的模型（`demo/always-429`），让路由器能明显地发生回退。数据不会离开你的机器。
- **你自己集群的路由**：`python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` 会（只读，通过 `kubectl`）读取你代理的 `config.yaml`，以及其中引用到的服务商变量（**仅此而已**），并写出本地的 `config.cluster.yaml` 和 `.env`（已被 git 忽略：切勿提交）。然后执行 `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`。
- **`dev/mock-litellm.py`** 是一个小巧的假代理，用于演示各种界面状态（`--scenario warning|blocked|…`），无需 Docker。
- **`dev/evidence/`** 是拍下本 README 中每一张截图的工具：在 ConPTY 中运行真实的 Claude Code，再渲染成 PNG。见 [`dev/evidence/README.md`](../../dev/evidence/README.md)。

## 开发

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
```

插件的结构：`hooks/register.tsx` 负责把事件、命令、定时器和 toast 接起来；`hooks/litellm.ts` 负责解析凭据，并读取和规范化响应；`hooks/admin*.ts` 是管理员命令（`admin.ts` 负责对代理的读取，`admin-writes.ts` 负责写入，`admin-plan.ts` 负责预览和方案，`admin-commands.ts` 是整体流程，`args.ts` 是参数解析器）；`hooks/exceeded.ts` 和 `hooks/band.tsx` 构成超预算横幅；`hooks/summary.ts` 和 `hooks/view.tsx` 构建文本与面板；`hooks/format.ts` 放纯格式化函数；`types/index.d.ts` 是状态契约。

## 已知限制

- 不读取 `apiKeyHelper`（执行用户命令不在范围之内）。请使用 `litellm_key`。
- `/user/daily/activity` 在 LiteLLM 中仍是 beta 端点，可能会变化。
- 按模型预算（`model_max_budget`）、临时预算上调和密钥重新生成在代理端都是企业版专属功能，因此不提供（见[预算](#budgets-what-litellm-can-and-cannot-do)）。
- 超预算横幅绘制在终端和桌面端界面上（Claude Code 只在这两处提供该横条）；在其他界面上，由状态栏和面板来提示。
- 状态栏前面的 `⚠` 是 Claude Code 为每个插件状态项统一绘制的；它并不表示密钥出了问题（要看后面的文字）。
- Claude Code 的插件 API 处于早期访问阶段，不同版本之间可能会变化。

## 其他语言

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · **简体中文** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
