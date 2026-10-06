<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm：在 Claude Code 中查看你的 LiteLLM 密钥、预算与回退链" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude Code 插件" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 和 v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
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

这是一个 [Claude Code](https://code.claude.com) 插件，面向通过 **[LiteLLM](https://docs.litellm.ai) 代理** 访问模型的用户。它会显示代理所掌握的、Claude Code 当前所用**虚拟密钥**的信息（预算、花费、限额、有效期、可用模型、近 7 天用量）；对管理员而言，还能在不离开终端的情况下 **创建和编辑密钥、为他人追加预算、禁用密钥，并查看路由器的回退链**。

本仓库是一个插件市场（`cc-litellm`），目前只有一个插件：[`litellm-key`](../../plugins/litellm-key)。

<p align="center">
  <img src="../evidence/pane.png" alt="/litellm 面板显示在对话旁边，连接的是真实的 LiteLLM 代理" width="92%">
</p>

## 功能一览

| | | |
| --- | --- | --- |
| 👀 **监控** | **状态栏**，位于输入框下方，始终可见 | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm` 面板** | 密钥、团队、用户和**团队成员**预算的用量条，用户**角色**、限额、有效期、可用模型、7 天迷你趋势图、本周的**模型排行**以及 **Runway** 预测；自动刷新 |
| | **Toast 提示** | 预算用到 80%（可配置）、95%、100% 时；密钥即将过期；密钥被禁用或已过期。每个预算周期只提醒一次，跨会话同样如此 |
| | **超预算横幅** | 输入框上方的红色横条，**只要有预算被用尽就会一直显示**（密钥、用户、团队、预算窗口或模型），数值恢复正常后才消失 |
| 🛠️ **管理** *(管理员)* | **`/litellm key new`** | 创建虚拟密钥；密钥明文会写入**剪贴板，绝不进入对话记录** |
| | **`/litellm grant`** | 为密钥、用户、团队或组织追加预算，附带预览与确认 |
| | **`/litellm key set`** / `reset-spend` | 修改密钥的可用模型、限额、有效期或别名；把它的花费计数器清零 |
| | **`/litellm key block`** / `unblock` | 一行命令禁用（或恢复）一个密钥 |
| | **`/litellm org`** | 组织的预算，虚拟密钥无法读取 |
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

### 团队为每位成员设上限时

团队可以为每位成员的花费设置上限（`team_member_budget`）。即使密钥自身的预算还有余量，代理也会拒绝请求，所以插件会读取这个上限，并以 `Member` 用量条显示出来，超预算横幅也会点出它：

<p align="center">
  <img src="../evidence/member-cap.png" alt="面板中超出上限的 Member 用量条、输入框上方的横幅，以及已点名的密钥所属组织" width="92%">
</p>

<sub>拍摄自 `dev/mock-litellm.py --scenario member`。代理不会向虚拟密钥报告成员的总额，所以用量条统计的是<b>这个密钥的花费</b>，并会如实说明。读数可能偏低；对于会重置的上限，读数也可能偏高（重置会清零成员的花费，而不是密钥的花费），因此只有针对从不重置的上限，才会显示超预算横幅。密钥所属的组织也会被点名；其预算仅限管理员查看，<code>/litellm org</code> 可以读取。</sub>

### 查看回退链

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### 了解模型的价格

<p align="center">
  <img src="../evidence/models-prices.png" alt="显示每百万 token 输入与输出价格以及上下文窗口的 /litellm models" width="92%">
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
| `/litellm models` | 列出该密钥可调用的模型，并附上每百万 token 的价格和上下文窗口。 |
| `/litellm debug` | 显示 URL 和密钥的来源（始终做掩码处理）、尝试过什么、结果如何。 |
| `/litellm close` | 关闭面板。 |
| `/litellm keys [--user ID \| --team ID \| --all]` | 列出密钥。默认：你自己所属用户的密钥。🔐 |
| `/litellm key new <alias> [flags]` | 创建密钥。🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | 禁用或恢复密钥。🔐 |
| `/litellm key set <alias\|hash> [flags]` | 修改密钥的可用模型、限额、有效期或别名。🔐 |
| `/litellm key reset-spend <alias\|hash>` | 把密钥的花费计数器清零。🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | 追加预算。🔐 |
| `/litellm org [id\|alias]` | 组织的预算；不带名称时，显示该密钥自己所属的组织，否则显示列表。🔐 |
| `/litellm fallbacks [model]` | 路由器的回退链，可只看名称匹配的模型。🔐 |

🔐 = 管理员命令，见下文。在面板中（点击面板，或按 `ctrl+x` `tab` 获得焦点）：`r` 刷新，`c` 复制摘要，`q` 关闭，方向键滚动；每个按钮都标明了对应的按键（`Refresh (r)`、`Copy (c)`、`Close (q)`）。输入框为空时，`Esc` 同样可以关闭面板。

面板会随可用空间自适应：位于对话旁边时（全屏，宽度 110 列起），每个用量条占两行；位于输入框上方时，从 122 列起，用量条会变成一张表；在更窄的终端里，每个用量条仍占两行，如果启用了 `compact_pane`，则切换为**紧凑**布局。位于对话旁边时，面板会显示带标题的分区（`BUDGETS`、`KEY`、`LAST 7 DAYS`、`TOP MODELS`），并在一周每一天的下方标出一个字母；`TOP MODELS` 按花费从高到低列出前五个模型，并用一根条显示各自占本周花费的比例。过长的名称会从中间截断，因此 `claude-sonnet-4-5` 和 `claude-sonnet-4-6` 仍能区分开。颜色从来不是唯一的信号：`▲` 表示接近上限的预算，`✖` 表示已用尽的预算，没有花费的一天显示为 `·`，而不是一根很短的条。

**Runway.** `Runway` 行（在面板和 `/litellm info` 中）把最近 7 天的花费节奏（密钥不足 7 天时按实际天数，最少 1 天）与上限相比：`lasts until the reset at $2.18/day`；如果预算会在重置前耗尽，则显示 `out in 2d 6h at $2.18/day · resets in 6d 12h`。状态栏只在这种情况即将出现时才追加 `out in 2d 6h at this pace`：即在重置之前耗尽，或对没有重置的密钥在 3 天之内耗尽。没有上限的密钥、已经用尽的密钥，以及重置时间已到的密钥，都不显示预测。

<p align="center">
  <img src="../evidence/runway.png" alt="即将耗尽的密钥的面板：Runway 行和状态栏都会发出警告，并且这一周的花费按模型拆分" width="92%">
</p>

<sub>针对 `dev/mock-litellm.py --scenario warning` 截取：本地实验环境没有一周的历史数据可供预测。</sub>

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
/litellm grant 25 --org acme                     # +$25 on the organization (LiteLLM before 1.102, or enterprise)
/litellm key set ci-runner --models cloud/auto --rpm 30 --expires 14d
/litellm key set ci-runner --rpm none --expires never   # none removes a limit; --models all clears the list
/litellm key reset-spend ci-runner               # the budget counter back to $0
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

| `key set` 参数 | 含义 |
| --- | --- |
| `--models a,b` / `--models all` | 替换该密钥可调用的模型（`all`：所有模型）。 |
| `--rpm N` / `--tpm N` / `--parallel N` | 设置限制；`none` 表示移除该限制。 |
| `--expires 30d` / `--expires never` | 自现在起经过这么长时间后过期，或永不过期。 |
| `--alias NEW` | 重命名该密钥。 |

未指定的字段保持不变。预览会为每个字段显示 `before → after`，并在该密钥正是 Claude Code 当前使用的密钥时给出警告。

每条管理员命令都有这些安全护栏：

- **先预览。** `--dry-run` 到预览为止；`--yes` 跳过确认；否则由 Claude Code 的原生对话框询问（**Apply** / **Cancel**）。
- **回读。** 追加预算后，插件会从代理重新读取预算，报告的是代理里*实际存在*的值，而不是它发出去的值。
- **新密钥的明文绝不会进入对话记录。** 它会写入剪贴板。如果剪贴板写不进去，密钥会被**再次删除**（回滚），而不是留下一个读不出来的密钥。`--reveal` 会把它打印出来，并警告该密钥现已保存在对话记录中。
- **拒绝裸 `sk-…` 值**作为密钥引用：请使用别名或密钥哈希。未知参数会报错，而不是被悄悄忽略。
- **数字如实呈现。** `grant` 会明确指出以下情形：花费已超过新预算、没有上限可供叠加（请用 `--set`）、没有任何变化，以及 `--user` 将创建一个代理从未见过的用户。
- **管理员密钥**只会发送给已接受你当前会话自身密钥的那个代理，并且绝不打印（错误信息会做脱敏）。

目前在 LiteLLM v1.99.1 和 v1.104.0 上，*能够*追加的预算有：调高**密钥**预算、**用户**预算或**团队**预算（`--team`，需要代理管理员），可按增量或绝对值（`--set`）调整。**组织**预算（`--org`）在 v1.101 及以前可用；从 v1.102 起，代理把组织功能留给企业版许可证，插件会如实说明。*临时*预算上调（`temp_budget_increase`）和按模型设置的预算在代理端属于企业版专属功能（见[预算](#budgets-what-litellm-can-and-cannot-do)），因此插件不提供这些功能，而不是假装支持。

<a id="budgets-what-litellm-can-and-cannot-do"></a>
## 预算：LiteLLM 能做什么，不能做什么

已针对 LiteLLM v1.99.1（开源版代理，无许可证）实测；成员上限和组织预算也在 v1.104.0 上实测过：

| 预算 | 是否可用 | 方式 |
| --- | --- | --- |
| 按**密钥**（上限 + 重置窗口） | ✅ | `/litellm key new --budget 10 --every 30d`；用 `/litellm grant 5 --key NAME` 调高 |
| 按**用户** | ✅ | `/litellm grant 5 --user ID`（对该用户名下的所有密钥生效） |
| 按**团队** | ✅ | `/litellm grant 50 --team NAME`（需要代理管理员） |
| 按团队**成员**（`team_member_budget`） | 👀 只读 | 拦截该用户在这个团队中的请求（HTTP 429，v1.104 起为 422）。面板把上限显示为 `Member…`；请在 LiteLLM UI 或 API 中设置。虚拟密钥读不到该成员的总额，所以用量条统计的是**这个密钥的花费**，并会如实说明。重置会清零成员的花费，但不会清零密钥的花费，所以只有针对从不重置的上限，才会显示超预算横幅；针对会重置的上限，用量条只给出警告，不会断言请求已被拦截 |
| 按**组织** | ✅ v1.101 及以前 · ⛔ v1.102 起为企业版 | 拦截该组织内的所有密钥（HTTP 429）。虚拟密钥读不到它：面板会显示组织名称，`/litellm org` 显示预算（管理员），`grant --org` 可调高预算 |
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
| `litellm_admin_key` | 空 | 供 `keys`、`key new/set/reset-spend/block/unblock`、`grant`、`org`、`fallbacks` 使用的管理员密钥。🔒 存储方式相同。绝不打印。 |
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
| `/user/info`、`/team/info` | 密钥所属用户和团队的预算，以及团队的单成员上限（设有上限时）。每次读取都会请求。 |
| `/v1/models` | 实际允许使用的模型。每 10 分钟一次。 |
| `/model_group/info` | 这些模型每个 token 的价格和上下文窗口（代理会返回它所有模型的数据，插件只保留被允许的那些）。每 10 分钟一次。 |
| `/user/daily/activity` | 最近 7 天的花费、请求数和 token 数，以及按模型划分的花费。每 10 分钟一次。 |

**管理**只会在你输入管理员命令时发生：`GET /key/list`、`/key/info`、`/user/info`、`/team/info`、`/v2/team/list`、`/organization/info`、`/organization/list`、`/router/settings`，以及 `POST /key/generate`、`/key/delete`（仅用于回滚）、`/key/block`、`/key/unblock`、`/key/update`、`/key/{hash}/reset_spend`、`/user/update`、`/team/update`、`PATCH /organization/update`。

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

`dev/litellm` 是一套完整的实验环境：LiteLLM v1.104.0 加 Docker 中的 Postgres 18，所以虚拟密钥、预算和花费都是真实的。CI 会在每次变更时启动它并运行冒烟测试。

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
bash dev/check-file-size.sh                             # no source file over 300 lines
```

插件的结构：`hooks/register.tsx` 是唯一接触 Claude Code 的 `$` 的文件；它构建注入的端口（`hooks/ports.ts`），并把事件、命令、定时器和 toast 接起来。其余全是接收这些端口的普通函数，因此无需启动引擎即可在测试中运行。`hooks/session.ts` 是读取周期（配置、ticker、排队中的强制刷新）；`hooks/credentials.ts` 和 `hooks/settings.ts` 负责解析密钥和选项；`hooks/litellm.ts` 负责读取代理，`hooks/parsers.ts` 和 `hooks/json.ts` 负责规范化响应，`hooks/failures.ts` 负责说明出了什么问题；`hooks/alerts.ts` 决定何时弹出 toast。`hooks/commands.ts` 是 `/litellm` 的命令表，`hooks/admin*.ts` 是管理员命令（`admin.ts` 负责对代理的读取，`admin-targets.ts` 负责对密钥、用户和团队的查找，`admin-writes.ts` 负责写入，`admin-plan.ts` 负责预览和方案，`admin-link.ts` 负责管理员密钥与代理的关联，`admin-commands.ts` 是整体流程，`args.ts` 是参数解析器）；`hooks/exceeded.ts` 和 `hooks/band.tsx` 构成超预算横幅；`hooks/summary.ts` 构建文本，`hooks/view.tsx` 和 `hooks/parts.tsx` 构建面板（仪表、分区标题、状态标签、用量条行）；`hooks/format.ts` 放纯格式化函数；`types/index.d.ts` 是状态契约。

## 已知限制

- 不读取 `apiKeyHelper`（执行用户命令不在范围之内）。请使用 `litellm_key`。
- `/user/daily/activity` 在 LiteLLM 中仍是 beta 端点，可能会变化。
- 按模型预算（`model_max_budget`）、临时预算上调和密钥重新生成在代理端都是企业版专属功能，因此不提供（见[预算](#budgets-what-litellm-can-and-cannot-do)）。在代理端编辑回退链需要 `STORE_MODEL_IN_DB=True`，因此 `/litellm fallbacks` 保持只读。
- **组织**的预算不在密钥自身的响应里，虚拟密钥也可能无权读取它，所以面板只显示组织的名称；`/litellm org` 用管理员密钥读取。管理员密钥仍然只在你输入管理员命令时才会发送，绝不会随刷新定时器发送。
- 团队**成员**的总额不会报告给虚拟密钥：`Member` 用量条只统计这个密钥的花费，所以读数可能偏低：如果该用户在团队里有多个密钥，代理可能比用量条显示的更早拦截请求。对于会重置的上限，读数也可能偏高（重置会清零成员的花费，而不是密钥的花费），因此这种情况下只发出警告，横幅保持静默。
- 7 天历史只读取代理活动记录的一页；记录更多时，面板会提示这是部分数据。
- 超预算横幅绘制在终端和桌面端界面上（Claude Code 只在这两处提供该横条）；在其他界面上，由状态栏和面板来提示。
- 状态栏前面的 `⚠` 是 Claude Code 为每个插件状态项统一绘制的；它并不表示密钥出了问题（要看后面的文字）。
- Claude Code 的插件 API 处于早期访问阶段，不同版本之间可能会变化。

## 许可证

[MIT](../../LICENSE).

## 其他语言

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · **简体中文** · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
