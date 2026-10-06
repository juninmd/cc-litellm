<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm: Claude Code の中で LiteLLM のキー、予算、フォールバックを確認する" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude Code プラグイン" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 と v1.104.0 検証済み" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289 検証済み" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="バージョン 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.pt-BR.md">Português</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <b>日本語</b> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> この文書は英語版 README([README.md](../../README.md))の日本語訳です。内容に差異がある場合は、英語版を正とします。

# cc-litellm

**[LiteLLM](https://docs.litellm.ai) プロキシ**経由でモデルを利用している人向けの [Claude Code](https://code.claude.com) プラグインです。Claude Code が使っている**仮想キー**についてプロキシが把握している情報(予算、使用額、制限、有効期限、利用可能なモデル、直近 30 日間の使用状況)を表示します。管理者は、ターミナルを離れることなく、**キーの作成と編集、追加予算の付与、キーのブロック、ルーターのフォールバックチェーンの確認**も行えます。

このリポジトリはプラグインマーケットプレイス(`cc-litellm`)で、プラグインは 1 つだけ含まれています: [`litellm-key`](../../plugins/litellm-key)。

<p align="center">
  <img src="../evidence/pane.png" alt="会話の横に表示した /litellm ペイン(実際の LiteLLM プロキシに接続)" width="92%">
</p>

## 提供する機能

| | | |
| --- | --- | --- |
| 👀 **監視** | **ステータスライン**: プロンプトの下に常時表示 | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm` ペイン** | キー、チーム、ユーザー、**チームメンバー**の予算メーター、ユーザーの**ロール**、制限、有効期限、モデル、7 日間のスパークライン、週の**上位モデル**、**Runway** の予測。自動で更新 |
| | **ペインのタブ** | **Usage**(使用額・リクエスト数・トークン数を日ごとの棒グラフで、7・14・30 日、選べる 1 日、各モデルの動き)、**Models**(それぞれの使用額、フィルター、並べ替え)、**Details**(キーの各項目、LiteLLM のバージョンとデータベース、レイテンシ) |
| | **ガイダンス** | **Allowance**(リセットまで持たせるための 1 日あたりの使用額)、**Headroom**(上限にあと何リクエスト入るか)、**Today**(普段の 1 日との比較)、**Session**(この Claude Code セッションの使用額とそのペース) |
| | **トースト** | 予算が 80%(変更可)、95%、100% に達したとき、キーの期限切れが近いとき、キーがブロックまたは期限切れになったとき、今日の使用額が**日次アラート**を超えたとき。予算ウィンドウごとに 1 回のみで、セッションをまたいでも重複しない |
| | **予算超過バナー** | プロンプトの上に出る赤い帯。予算(キー、ユーザー、チーム、ウィンドウ、モデル)を使い切っている間は**表示され続け**、数値が正常に戻ったときだけ消える |
| 📊 **レポート** | **`/litellm pace`**、`usage`、`compare`、`day`、`status` | 予算の行き先、日別とモデル別の表、前の日々と比べて何が変わったか、モデル別の 1 日 |
| | **`/litellm check`** | `OK`、`WARNING`、`CRITICAL`、`UNKNOWN` **と `claude -p` 実行の終了コード**(0〜3)。スクリプトや監視向け |
| | **`/litellm json`** / `csv` | すべてを JSON で、日別を CSV で。**`copy`** はレポートをクリップボードへ、**`share`** は Claude に渡して質問できるようにする |
| 🛠️ **管理** *(管理者)* | **`/litellm key new`** | 仮想キーを作成。シークレットは**クリップボードに入り、トランスクリプトには残らない** |
| | **`/litellm grant`** | キー、ユーザー、チーム、組織への追加予算。プレビューと確認つき |
| | **`/litellm key set`** / `reset-spend` | キーのモデル、制限、有効期限、エイリアスを変更。使用額カウンターを 0 に戻す |
| | **`/litellm key block`** / `unblock` | 1 行でキーを停止(または復元) |
| | **`/litellm org`** | 組織の予算。仮想キーでは読み取れない |
| | **`/litellm keys`** | キーの一覧: 自分のキー、特定ユーザーのキー、特定チームのキー、またはすべて |
| | **`/litellm fallbacks`** | ルーターのフォールバックチェーン(`cloud/auto → cloud/auto-long → …`)と、コンテキストウィンドウのフォールバック |

すべての変更は、まず**プレビュー**を表示し、Claude Code の**ネイティブダイアログ**で確認を求め、適用したうえで、プロキシから**結果を読み戻します**。

<a id="install"></a>

## インストール

最近のバージョンの Claude Code が必要です。このプラグインは function hooks(アーリーアクセスの API)を使用しており、2.1.289 で検証しています。

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

インストールせずにクローンから試す場合: `claude --plugin-dir ./plugins/litellm-key`。

Claude Code がすでに LiteLLM と通信している場合、**設定は不要**です。プラグインは Claude Code が使うのと同じ URL とキーを読み取ります。管理者コマンドには `litellm_admin_key` も必要です([管理者コマンド](#admin-commands)を参照)。

## 機能ツアー

### 予算を見守る

<p align="center">
  <img src="../evidence/statusline.png" alt="プロンプトの下に litellm-key のステータスラインが表示された Claude Code" width="92%">
</p>

`/litellm models` はキーが呼び出せるモデルを、`/litellm keys` は自分が所有するキーを一覧表示します:

<p align="center">
  <img src="../evidence/keys.png" alt="/litellm models と /litellm keys の出力" width="92%">
</p>

### 詳しく見る: 使用状況、モデル、詳細

ペインにはタブが 4 つあります。Overview は上のダッシュボードです。**Usage** は直近 7・14・30 日を棒グラフで描き、使用額・リクエスト数・トークン数のいずれかを数え、1 日を選ぶとそのモデルを見られ、前の日々と比べてどのモデルが動いたかを示します:

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

**Models** は、キーが呼び出せるモデルを、その期間に各モデルが使った額とともに一覧にします(使用額または名前で並べ替え、長い一覧はフィルターに入力して絞り込めます)。**Details** は、プロキシがキーについて返した内容、LiteLLM のバージョンとデータベースの状態、`/key/info` にかかった時間をまとめます。選んだ期間・並べ替え・グラフは次回のために記憶され、`/litellm` は最後に開いていたタブでペインを開きます。

### レポートを頼む、またはスクリプトに渡す

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
claude -p "/litellm check"; echo $?    # WARNING · 83% of budget … (exit 1)
claude -p "/litellm json" | jq .budget.percent
claude -p "/litellm csv 30" > usage.csv
```

### 問題を早期に見つけ、名前を付けて示す

プラグインは、汎用的な *401* で済ませず、ブロックされたキー、期限切れのキー、誤ったキーを区別して示します:

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="予算の 86% を使用"><br><sub><b>86%</b>: 警告トーストとステータスライン</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="予算超過"><br><sub><b>予算超過</b>: 予算が正常に戻るまで表示され続けるバナー</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="キーがブロックされている"><br><sub><b>ブロック</b>されたキーは、ブロックと明示</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="キーが期限切れ"><br><sub><b>期限切れ</b>のキーは、期限切れと明示</sub></td>
  </tr>
</table>

### キーを生成する

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="キー作成前のネイティブな確認ダイアログ"><br><sub>プレビューのあと、Claude Code のネイティブ確認</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="キーがクリップボードにコピーされた"><br><sub>シークレットはクリップボードへ。トランスクリプトに見えるのは <code>sk-…9FKg</code> だけ</sub></td>
  </tr>
</table>

### 追加予算を付与する

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="予算付与のプレビュー"><br><sub><code>$25 → $35 (+$10)</code>、使用済みの額、付与後の残り</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="付与後にキーへ余裕が戻った"><br><sub>適用して読み戻し、ステータスラインも追従(101% → 79%)</sub></td>
  </tr>
</table>

### チームがメンバーごとに上限を設けるとき

チームは、メンバーごとの支出に上限を設けられます(`team_member_budget`)。キー自身の予算に余裕があってもプロキシはリクエストを拒否するため、プラグインはこの上限を読み取って `Member` メーターとして表示し、予算超過バナーもそれを名指しします:

<p align="center">
  <img src="../evidence/member-cap.png" alt="上限を超えた Member メーターを表示したペイン、プロンプトの上のバナー、名前が示されたキーの組織" width="92%">
</p>

<sub>`dev/mock-litellm.py --scenario member` に対して撮影。プロキシは仮想キーにメンバーの合計額を報告しないため、メーターは<b>このキーの使用額</b>を数え、その旨を明示します。実際より低く表示されることがあり、リセットされる上限に対しては高く表示されることもあります(リセットでゼロになるのはメンバーの支出であって、キーの支出ではありません)。そのため、バナーはリセットされない上限に対してのみ表示されます。キーの組織も名前が表示されます。その予算は管理者専用で、<code>/litellm org</code> が読み取ります。</sub>

### フォールバックチェーンを読む

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### モデルの価格を知る

<p align="center">
  <img src="../evidence/models-prices.png" alt="入力・出力の 100 万トークンあたりの価格とコンテキストウィンドウを示した /litellm models" width="92%">
</p>

### プロキシ側でも一致している

ここまでの内容は、プラグインの操作を反映した、本物の LiteLLM v1.99.1 管理 UI の画面です:

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="LiteLLM UI の Virtual Keys"><br><sub>Claude Code から作成・増額したキー。1 件は期限切れ</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="LiteLLM UI の Usage"><br><sub>使用額が Usage に反映される</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="LiteLLM UI の Internal Users"><br><sub>ユーザーのプロキシ上のロール(<code>internal_user</code>、<code>proxy_admin</code>)が、ペインの <b>Role</b> 行に表示される内容</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/litellm` | 最後に開いていたタブでペインを開く(1 行のサマリーも返す)。画面がない場合はそのタブをテキストで出力する。 |
| `/litellm tab <name>` | ペインを `overview`、`usage`、`models`、`details` のタブで開く(または 1〜4)。 |
| `/litellm refresh` | 今すぐ再読み込みする。 |
| `/litellm info` | サマリー全文をトランスクリプトに出力する。 |
| `/litellm status` | ステータスラインをテキストで出力する。 |
| `/litellm pace` | 予算の行き先、持たせるために 1 日に使える額、チームとユーザーについても同様。 |
| `/litellm usage [7\|14\|30]` | 日ごとの使用額、リクエスト数、トークン数を表で、合計とモデルとともに出力する。 |
| `/litellm compare [7\|14]` | 直近の丸 1 日ずつの期間を、その前の同じ日数と、全体およびモデルごとに比較する。 |
| `/litellm day [when]` | モデル別の 1 日分: `today`、`yesterday`、`2026-10-03`、`10-03`、または曜日(`mon`)。 |
| `/litellm models [text]` | このキーが呼び出せるモデルを、100 万トークンあたりの価格とコンテキストウィンドウとともに一覧表示する。テキストを渡すと、名前にそれを含むものだけを表示する。 |
| `/litellm check [warn%]` | `OK`、`WARNING`、`CRITICAL`、`UNKNOWN` のいずれかと、`claude -p` 実行の終了コード(0、1、2、3)。上限を超えた予算、またはプロキシがブロック・期限切れ・拒否と返したキーは `CRITICAL`。応答しないプロキシは `UNKNOWN`。 |
| `/litellm json` | プラグインがキーについて把握しているすべてを JSON で出力する(キーもハッシュも含まない)。 |
| `/litellm csv [7\|14\|30]` | 日別データを CSV で出力する。 |
| `/litellm copy [what]` | レポートをクリップボードに置く: `overview`、`usage`、`models`、`details`、`pace`、`compare`、`csv`、`json`。 |
| `/litellm share [what]` | 画面には出さずにレポートを Claude に渡し、次の質問をそのレポートについてできるようにする。 |
| `/litellm ping` | プラグインが読み込む各エンドポイントを試し、ステータスと所要時間を表示する。 |
| `/litellm debug` | URL とキーの取得元(常にマスク)、試行した内容、結果を表示する。 |
| `/litellm close` | ペインを閉じる。 |
| `/litellm keys [--user ID \| --team ID \| --all]` | キーを一覧表示する。既定は自分のユーザーのキー。🔐 |
| `/litellm key new <alias> [flags]` | キーを作成する。🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | キーをブロック、または復元する。🔐 |
| `/litellm key set <alias\|hash> [flags]` | キーのモデル、制限、有効期限、エイリアスを変更する。🔐 |
| `/litellm key reset-spend <alias\|hash>` | キーの使用額カウンターを 0 に戻す。🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | 予算を追加する。🔐 |
| `/litellm org [id\|alias]` | 組織の予算。名前を省略した場合は、キー自身の組織、なければ一覧。🔐 |
| `/litellm fallbacks [model]` | ルーターのフォールバックチェーン。名前に一致するモデルに絞ることもできる。🔐 |

🔐 = 管理者コマンド(下記を参照)。ペイン内の操作(クリック、または `ctrl+x` `tab` でフォーカス): `1`〜`4` でタブを切り替え、`r` で更新、`c` で表示中のタブをコピー、`q` で閉じる、矢印キーでスクロール。各ボタンには対応するキーが併記されます(`Refresh (r)`、`Copy (c)`、`Close (q)`)。Usage では `d` で 7・14・30 日を順に切り替え、`m` で使用額・リクエスト数・トークン数を切り替え、`v` で日別データを CSV としてコピー。Models では `s` で並べ替え、`f` でフィルターへ移動。空のプロンプトでは `Esc` でもペインを閉じられます(Models ではフィルターから抜けるだけです)。

コマンドを打ち間違えると候補が表示されます(`Did you mean "usage"?`)。求められたことができないコマンドは、その旨を 1 文で伝えます。スクリプト向けのコマンド(`check`、`json`、`csv`、`ping`)は、報告する内容がないとき終了コード 3 で終わります。

ペインは利用できる幅に合わせて表示を変えます。会話の横に表示する場合(全画面、110 桁以上)は、各メーターが 2 行になります。プロンプトの上に表示する場合は、122 桁以上でメーターが表になります。それより狭いターミナルでは、メーターは 1 つあたり 2 行のままですが、`compact_pane` を有効にすると**コンパクト**表示になります。会話の横に表示する場合、ペインにはタイトル付きのセクション(`BUDGETS`、`KEY`、`LAST 7 DAYS`、`TOP MODELS`)が付き、各曜日の下に 1 文字が表示されます。`TOP MODELS` では、使用額の多い上位 5 モデルを、週の使用額に占める割合のバーとともに並べます。長い名前は中央で切り詰められるため、`claude-sonnet-4-5` と `claude-sonnet-4-6` は区別できます。色だけが唯一の手がかりになることはありません。`▲` は上限に近い予算、`✖` は使い切った予算を示し、使用額がない日は短いバーではなく `·` で表します。

**Runway.** `Runway` 行(ペインと `/litellm info` に表示)は、直近 7 日間の使用ペース(それより新しいキーでは日数が少なくなり、最小は 1 日)を上限と比べます。予算がリセットまで持つなら `lasts until the reset at $2.18/day`、先に尽きる場合は `out in 2d 6h at $2.18/day · resets in 6d 12h` と表示されます。ステータスラインが `out in 2d 6h at this pace` を加えるのは、その事態が迫っているときだけです。リセット前に尽きる場合、またはリセットのないキーでは 3 日以内に尽きる場合です。上限のないキー、すでに使い切ったキー、リセット日を過ぎたキーには予測が表示されません。

<p align="center">
  <img src="../evidence/runway.png" alt="使い切りそうなキーのペイン: Runway 行とステータスラインが警告し、1 週間の支出がモデル別に分かれている" width="92%">
</p>

<sub>`dev/mock-litellm.py --scenario warning` に対して撮影: ローカルのラボには、予測の基になる 1 週間分の履歴がありません。</sub>

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>

## 管理者コマンド

キーの読み取りと変更にはプロキシ管理者の権限が必要です。**`litellm_admin_key`** オプションを設定してください(OS の資格情報ストアに保存され、`settings.json` には保存されません)。未設定の場合、プラグインは仮想キーで試行し、プロキシに拒否されたときは、その旨をそのまま伝えます。

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

| `key new` のフラグ | 意味 |
| --- | --- |
| `--budget 10` | 支出の上限(ドル)。 |
| `--every 30d` | 予算ウィンドウ。30 日ごとにリセットされる(`s m h d w mo`)。 |
| `--soft 8` | ソフトアラートのしきい値。 |
| `--models a,b` | キーが呼び出せるモデル(既定はすべて)。 |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | レート制限。 |
| `--expires 30d` | この期間が過ぎるとキーが使えなくなる。 |
| `--user ID` / `--team ID` | キーの所有者(その予算も併せて適用される)。 |

| `key set` のフラグ | 意味 |
| --- | --- |
| `--models a,b` / `--models all` | キーが呼び出せるモデルを置き換える(`all`: すべてのモデル)。 |
| `--rpm N` / `--tpm N` / `--parallel N` | 制限を設定する。`none` で制限を解除する。 |
| `--expires 30d` / `--expires never` | 今からこの期間が過ぎると期限切れにする。`never` なら無期限。 |
| `--alias NEW` | キーのエイリアスを変更する。 |

指定しなかったフィールドは、そのまま変わりません。プレビューには各フィールドの `before → after` が表示され、そのキーが Claude Code で使用中のキーである場合は警告が出ます。

すべての管理者コマンドに備わる安全策:

- **まずプレビュー。** `--dry-run` はプレビューで止まります。`--yes` は確認を省略します。どちらも指定しなければ、Claude Code のネイティブダイアログで確認します(**Apply** / **Cancel**)。
- **読み戻し。** 付与のあと、プラグインはプロキシから予算を再取得し、送信した値ではなく、プロキシに*実際にある*値を報告します。
- **新しいシークレットはトランスクリプトに残りません。** クリップボードに入ります。クリップボードに入れられない場合は、読めない状態のまま残さず、キーを**再度削除**(ロールバック)します。`--reveal` を指定すると表示されますが、トランスクリプトに保存される旨の警告が付きます。
- **生の `sk-…` 値はキーの参照として拒否されます。** エイリアスかキーのハッシュを使ってください。未知のフラグは黙って無視されず、エラーになります。
- **正直な数値。** `grant` は、使用額がすでに新しい予算を超えている場合、加算先となる上限がない場合(`--set` を使用)、何も変わらない場合、`--user` がプロキシの未知のユーザーを新規作成することになる場合に、それぞれ明示します。
- **管理者キー**は、セッション自身のキーをすでに受け入れたプロキシにのみ送信され、表示されることはありません(エラーはマスク処理されます)。

LiteLLM v1.99.1 と v1.104.0 で現時点で追加予算として付与*できる*のは、**キー**の予算、**ユーザー**の予算、**チーム**の予算(`--team`、プロキシ管理者が必要)の引き上げで、増分または絶対値(`--set`)で指定します。**組織**の予算(`--org`)は v1.101 まで使えます。v1.102 以降、プロキシは組織をエンタープライズライセンス専用にしており、プラグインはその旨を伝えます。*一時的な*予算の増額(`temp_budget_increase`)とモデル別の予算は、プロキシ側ではエンタープライズ限定です([予算](#budgets-what-litellm-can-and-cannot-do)を参照)。できるように見せかけず、プラグインでは提供していません。

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## 予算: LiteLLM でできること、できないこと

LiteLLM v1.99.1(オープンソースのプロキシ、ライセンスなし)で実機確認済みです。メンバー上限と組織は v1.104.0 でも確認しました:

| 予算 | 可否 | 方法 |
| --- | --- | --- |
| **キー**単位(上限 + リセットウィンドウ) | ✅ | `/litellm key new --budget 10 --every 30d`。引き上げは `/litellm grant 5 --key NAME` |
| **ユーザー**単位 | ✅ | `/litellm grant 5 --user ID`(ユーザーが所有するすべてのキーに適用) |
| **チーム**単位 | ✅ | `/litellm grant 50 --team NAME`(プロキシ管理者が必要) |
| チームの**メンバー**単位(`team_member_budget`) | 👀 読み取り専用 | そのチーム内でのユーザーのリクエストをブロックする(HTTP 429、v1.104 以降は 422)。ペインには上限が `Member…` として表示される。設定は LiteLLM の UI または API で行う。仮想キーはメンバーの合計額を読み取れないため、メーターは**このキーの使用額**を数え、その旨を明示する。リセットでゼロになるのはメンバーの支出であってキーの支出ではないため、予算超過バナーはリセットされない上限に対してのみ表示される。リセットされる上限に対しては、メーターは警告を出すだけで、ブロックされるとは断定しない |
| **組織**単位 | ✅ v1.101 まで · ⛔ v1.102 以降はエンタープライズ | 組織内のすべてのキーをブロックする(HTTP 429)。仮想キーでは読み取れない。ペインには組織名が表示され、`/litellm org` で予算を確認でき(管理者)、`grant --org` で引き上げられる |
| 1 つのキーに複数のウィンドウ(`budget_limits`、例: $5/時間 + $50/月) | 読み取り専用 | プロキシ側に設定がある場合、`Window 1h` のメーターとして表示 |
| キーの**モデル**単位(`model_max_budget`) | ⛔ エンタープライズ | プロキシは *"You must have an enterprise license to set model_max_budget"* と応答する(`/budget/new` でも同様)。プロキシにライセンスがあれば、ペインにそのメーター(`Model gpt-4o`)が表示される |
| 一時的な予算の増額(`temp_budget_increase`) | ⛔ エンタープライズ | オープンソースのプロキシはこのフィールドを受け付けるが、適用はしない |

**ライセンスなしでモデル別の予算を実現するには:** モデルごとに 1 つずつキーを作り、それぞれに上限を設定します。例:
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`。このキーは該当モデルだけを呼び出せ、$5 に達すると止まります。

## 設定

プラグインは、Claude Code が使うのと同じ URL とキーを、次の順序で読み取ります(プロセスの環境変数が先、次に `settings.json` の `env` ブロック):

| 項目 | 取得元 |
| --- | --- |
| URL | オプション `litellm_url`、`ANTHROPIC_BASE_URL`、`LITELLM_PROXY_API_BASE` |
| キー | オプション `litellm_key`、`ANTHROPIC_CUSTOM_HEADERS` 内の `x-litellm-api-key` ヘッダー、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`LITELLM_PROXY_API_KEY` |

URL がパススルーのルート(`/anthropic`、`/bedrock`、`/v1` など)で終わっている場合、プラグインはプロキシのルートも試します。キーは、それが属する URL に対してのみ使われます。環境変数のキーが別ホストの `litellm_url` に送られることはなく、`LITELLM_PROXY_API_BASE` は `LITELLM_PROXY_API_KEY` とだけ組み合わされます。

すべてのオプションは任意です(インストール時に Claude Code が "not set" と表示しますが、問題ありません)。変更は `/plugin configure litellm-key@cc-litellm` で行います。あるいは、文字列だけからなる JSON オブジェクトを渡して `claude plugin configure litellm-key@cc-litellm --values-stdin` を実行します。

| オプション | 既定値 | 用途 |
| --- | --- | --- |
| `litellm_url` | 空 | 既定以外の場所にあるプロキシ(LiteLLM 経由の Bedrock/Vertex、プレフィックス付きの URL)。 |
| `litellm_key` | 空 | 明示的に指定するキー。🔒 資格情報ストアに保存され、`settings.json` には保存されない。 |
| `litellm_admin_key` | 空 | `keys`、`key new/set/reset-spend/block/unblock`、`grant`、`org`、`fallbacks` 用の管理者キー。🔒 保存先は同じ。表示されない。 |
| `refresh_seconds` | 60 | 読み取り間隔(15〜3600)。各ターンの後にも、最短 20 秒の間隔で読み取る。 |
| `warn_percent` | 80 | 最初の予算警告(95% と 100% でも警告する)。 |
| `daily_alert` | 0(無効) | その日のキーの使用額がこのドル額に達したら警告する。トーストは 1 日 1 回、ステータスラインとペインにも表示。有効にすると、使用履歴を 3 分ごとに読み込む。 |
| `show_toasts` | `yes` | 予算、日次アラート、期限が近いキー、応答しないプロキシを知らせるトースト。オフにすると、警告はステータスラインとペインだけに表示される。 |
| `show_status_line` | `yes` | プロンプトの下の行。 |
| `show_related` | `yes` | `/user/info` と `/team/info` を読む。それらの予算でもリクエストがブロックされうるため。 |
| `show_usage` | `yes` | `/user/daily/activity`(LiteLLM のベータ版エンドポイント)を読み、直近 30 日間の使用状況を取得する。Usage タブと Models タブ、レポート、runway、日次アラートがこれを土台にしている。 |
| `compact_pane` | `no` | 狭いターミナル(74〜121 桁)で、プロンプト上のペインをコンパクトにする。1 行に 1 メーター、情報は横並び。 |

## データの取得元

**監視**は読み取り(`GET`)のみで、常に自分のキーを使います:

| エンドポイント | 用途 |
| --- | --- |
| `/key/info` | エイリアス、使用額、予算とウィンドウ、リセット、制限、有効期限、ステータス、モデル、モデル別の予算。読み取りのたびに取得。 |
| `/user/info`、`/team/info` | キーのユーザーとチームの予算、およびチームのメンバー別の上限(上限がある場合)。読み取りのたびに取得。 |
| `/v1/models` | 実際に許可されているモデル。10 分ごと。 |
| `/model_group/info` | それらのモデルのトークンあたりの価格とコンテキストウィンドウ(プロキシは全モデル分を返し、プラグインは許可されたものだけを残す)。10 分ごと。 |
| `/user/daily/activity` | 直近 30 日間の使用額、リクエスト数、トークン数、モデルを日ごとに。10 分ごと。 |
| `/health/readiness` | LiteLLM のバージョンと、データベースが接続されているかどうか。10 分ごと。プロキシが返さない場合は何も表示されず、メモも出ない。 |

「10 分ごと」と記した読み取りは、`daily_alert` を設定している間は 3 分ごとに行われます。監視しているのは今日の使用額だからです。

**管理**は、管理者コマンドを入力したときにだけ行われます: `GET /key/list`、`/key/info`、`/user/info`、`/team/info`、`/v2/team/list`、`/organization/info`、`/organization/list`、`/router/settings`、および `POST /key/generate`、`/key/delete`(ロールバック時のみ)、`/key/block`、`/key/unblock`、`/key/update`、`/key/{hash}/reset_spend`、`/user/update`、`/team/update`、`PATCH /organization/update`。

各リクエストの待機時間は最大 4 秒です(管理者コマンドは 15 秒)。任意の読み取りが失敗しても(403、404 など)、ペインに控えめな注記が出るだけで、エラーにはなりません。プロキシが停止した場合、ペインは最後に成功した読み取り結果を保持し、古いデータであることを示します。LiteLLM は使用額をバッチでデータベースに書き込むため、数値はリクエストから約 10 秒遅れます。

## プライバシーとセキュリティ

- キーは、Claude Code がすでに使っているプロキシにのみ、`Authorization`(または `x-litellm-api-key`)ヘッダーで送信されます。URL、ログ、トースト、ステート、プラグインのストレージには決して含まれません。エラーメッセージは、キーをマスクするフィルターを通します。
- 管理者キーは、セッションのキーをすでに受け入れたプロキシのルートにのみ、かつ管理者コマンドを入力したときにのみ送信されます。
- プラグインが保存するのは、すでに表示した警告の ID だけです。同じ警告を繰り返さないためです。
- `litellm-key` は `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_CUSTOM_HEADERS`、`LITELLM_PROXY_API_BASE`、`LITELLM_PROXY_API_KEY`、および `settings.json` の `env` ブロックを読み取り、HTTP リクエストを行います。`claude plugin validate plugins/litellm-key` でそのすべてを一覧できます。

## 表示されない場合

| 症状 | 考えられる原因 |
| --- | --- |
| ステータスラインに何も表示されず、トーストに "not configured" と出る | Claude Code がプロキシ経由になっていない(`ANTHROPIC_BASE_URL` が未設定、または `api.anthropic.com`)。 |
| "The proxy has no database record for this key" | マスターキー、または `config.yaml` だけで定義されたキー。データがあるのは `/key/generate` で作成したキーだけ。 |
| "The proxy has no database" | プロキシが `DATABASE_URL` なしで動作している。読み取れる仮想キーが存在しない。 |
| "does not look like a LiteLLM proxy" | URL が別のものを指している。`litellm_url` にプロキシのルートを設定する。 |
| "key blocked" / "key expired" | 文字どおりの意味。管理者に依頼するか、別のセッションから `/litellm key unblock` を実行する。 |
| "key rejected (401)" | キーが無効。 |
| 使用履歴が表示されない | キーに `user_id` がないか、お使いの LiteLLM のバージョンにベータ版エンドポイントがない。 |
| 管理者コマンドが管理者キーを要求する | `litellm_admin_key` を設定する。 |
| 管理者コマンドが "until the proxy accepts this session's key" で待機する | 仕様です。管理者キーは、自分のキーを受け入れたプロキシにしか送信されません。別のセッションまたは LiteLLM UI で、そのキーを修復してください。 |

`/litellm debug` で、プラグインが解決した内容を確認できます。

## 手元のノート PC で本物の LiteLLM を試す

`dev/litellm` は完全なラボ環境です。Docker 上の Postgres 18 を伴う LiteLLM v1.104.0 なので、仮想キー、予算、使用額はすべて本物です。CI は変更のたびにこれを起動し、スモークテストを実行します。

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`**(既定)は、実際の "auto" 構成を再現します。重み付きの `cloud/auto` グループ、フォールバックチェーン、コンテキストウィンドウのフォールバック、そして常に失敗するモデル(`demo/always-429`)を備えており、ルーターがフォールバックする様子を目で確認できます。データがマシンの外に出ることはありません。
- **自分のクラスターのルーティング:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` は、(`kubectl` で読み取り専用に)プロキシの `config.yaml` と、そこで参照されているプロバイダー変数**だけ**を読み取り、ローカルに `config.cluster.yaml` と `.env` を書き出します(git の管理対象外。絶対にコミットしないでください)。そのうえで `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d` を実行します。
- **`dev/mock-litellm.py`** は、UI の各状態(`--scenario warning|blocked|…`)を再現する小さな偽プロキシで、Docker は不要です。
- **`dev/evidence/`** は、この README のスクリーンショットをすべて撮影したハーネスです。ConPTY 上で動く本物の Claude Code を PNG にレンダリングしています。[`dev/evidence/README.md`](../../dev/evidence/README.md) を参照してください。

## 開発

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

プラグインの構成: `hooks/register.tsx` は Claude Code の `$` に触れる唯一のファイルで、注入されるポート(`hooks/ports.ts`)を組み立て、イベント、コマンド、タイマー、トーストを結び付けます。それ以外はすべてそのポートを受け取る単純な関数なので、エンジンを起動せずにテストで実行できます。`hooks/session.ts` は読み取りサイクル(設定、ティッカー、キューに積まれた強制更新)です。`hooks/credentials.ts` と `hooks/settings.ts` はキーとオプションを解決します。`hooks/litellm.ts` はプロキシを読み取り、`hooks/parsers.ts` と `hooks/json.ts` は応答を正規化し、`hooks/failures.ts` は何がうまくいかなかったかを名前で示します。`hooks/alerts.ts` はトーストを出すかどうかを決めます。`hooks/commands.ts` は `/litellm` のコマンドテーブルで、`hooks/admin*.ts` は管理者コマンドです(`admin.ts` がプロキシの読み取り、`admin-targets.ts` がキー、ユーザー、チームの検索、`admin-writes.ts` が書き込み、`admin-plan.ts` がプレビューとプラン、`admin-link.ts` が管理者キーとプロキシの紐付け、`admin-commands.ts` が処理フロー、`args.ts` が引数パーサー)。`hooks/exceeded.ts` と `hooks/band.tsx` は予算超過バナーです。`hooks/summary.ts` はテキストを、`hooks/view.tsx` と `hooks/parts.tsx` はペイン(ゲージ、セクションタイトル、ステータスチップ、メーター行)を組み立てます。`hooks/format.ts` は純粋なフォーマッタ群で、`types/index.d.ts` は状態のコントラクトです。タブは `hooks/tab-*.tsx`(`tab-overview.tsx` はタブ導入前のペインのダッシュボード、`parts-tabs.tsx` は共通部品、`chart.ts` は棒グラフ)、レポートは `hooks/report-*.ts`、`details.ts`、`probe.ts`(`/litellm ping`)で、その下に `history.ts`(30 日分、合計と比較)と `guidance.ts`(allowance、headroom、today、セッション)があります。`hooks/commands-reports.ts` と `commands-share.ts` が、レポートを出力または引き渡すコマンドです。

## 既知の制限

- `apiKeyHelper` は読み取りません(ユーザーのコマンドを実行することはスコープ外です)。`litellm_key` を使ってください。
- `/user/daily/activity` は LiteLLM のベータ版で、変更される可能性があります。
- モデル別の予算(`model_max_budget`)、一時的な予算の増額、キーの再生成は、プロキシ側ではエンタープライズ限定のため提供していません([予算](#budgets-what-litellm-can-and-cannot-do)を参照)。フォールバックチェーンの編集にはプロキシ側で `STORE_MODEL_IN_DB=True` が必要なため、`/litellm fallbacks` は読み取り専用のままです。
- **組織**の予算はキー自身の応答に含まれず、仮想キーでは読み取れない場合があるため、ペインには組織名が表示されるだけです。`/litellm org` は管理者キーで読み取ります。管理者キーは、これまでどおり管理者コマンドを入力したときにだけ送信され、更新タイマーでは送信されません。
- チーム**メンバー**の合計額は仮想キーには報告されません。`Member` メーターはこのキーの使用額だけを数えるため、実際より低く表示されることがあります。ユーザーがチーム内に複数のキーを持つ場合、メーターが示すより早くプロキシがブロックすることがあります。リセットされる上限に対しては高く表示されることもあります(リセットでゼロになるのはメンバーの支出であって、キーの支出ではありません)。そのため、その場合は警告を出し、バナーは表示されません。
- 使用履歴は、プロキシのアクティビティ行を 1 ページ分だけ読み込みます。それ以上ある場合、ペインは一部のみだと表示します。日付はプロキシの数え方どおり UTC です。今日はまだ進行中なので、比較からは除外されます。
- **Session** 行は、この Claude Code セッションの最初の読み取りからキーの使用額がどれだけ増えたかを数えます。同じキーを使う別のセッションの使用額と、このセッションの使用額を区別することはできません。
- 予算超過バナーが描画されるのは、ターミナルとデスクトップのサーフェスです(Claude Code がバンドを提供するのはそこだけ)。それ以外では、ステータスラインとペインで知らせます。
- ステータスラインの前の `⚠` は、プラグインのステータス項目すべてに対して Claude Code が描画するもので、キーに問題があることを意味しません(それを示すのはテキストです)。
- Claude Code のプラグイン API はアーリーアクセスであり、バージョン間で変更される可能性があります。

## ライセンス

[MIT](../../LICENSE).

## 他の言語

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
