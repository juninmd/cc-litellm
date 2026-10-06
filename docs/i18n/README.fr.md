<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm : votre clé LiteLLM, votre budget et vos fallbacks dans Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Plugin Claude Code" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 et v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="Version 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.pt-BR.md">Português</a> ·
  <a href="README.es.md">Español</a> ·
  <b>Français</b> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> Ceci est une traduction du [README anglais](../../README.md). En cas de divergence, la version anglaise fait foi.

# cc-litellm

Un plugin [Claude Code](https://code.claude.com) pour celles et ceux qui accèdent à leurs modèles via un **proxy [LiteLLM](https://docs.litellm.ai)**. Il affiche ce que le proxy sait de la **clé virtuelle** utilisée par Claude Code (budget, dépenses, limites, expiration, modèles, usage sur 30 jours) et, pour les admins, permet de **créer et modifier des clés, d'accorder un budget supplémentaire, de bloquer une clé et de lire les chaînes de fallback du routeur** sans quitter le terminal.

Ce dépôt est une marketplace de plugins (`cc-litellm`) qui contient un seul plugin : [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="Le volet /litellm à côté de la conversation, face à un vrai proxy LiteLLM" width="92%">
</p>

## Ce que vous obtenez

| | | |
| --- | --- | --- |
| 👀 **Surveiller** | **Barre d'état** sous le prompt, toujours visible | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **Volet `/litellm`** | jauges des budgets de la clé, de l'équipe, de l'utilisateur et du **membre de l'équipe**, **rôle** de l'utilisateur, limites, expiration, modèles, sparkline sur 7 jours, le **top des modèles** de la semaine et une prévision de **runway** ; se rafraîchit tout seul |
| | **Onglets du volet** | **Usage** (dépenses, requêtes ou tokens par jour en barres, sur 7, 14 ou 30 jours, un jour à choisir, comment chaque modèle a bougé), **Models** (ce que chacun a dépensé, un filtre, un tri), **Details** (les champs de la clé, la version et la base de données de LiteLLM, la latence) |
| | **Repères** | **Allowance** (ce qu'on peut dépenser par jour pour tenir jusqu'à la réinitialisation), **Headroom** (combien de requêtes de plus le plafond permet), **Today** face au jour habituel, **Session** (ce que cette session de Claude Code a dépensé, et à quel rythme) |
| | **Notifications toast** | à 80 % (configurable), 95 %, 100 % ; clé sur le point d'expirer ; clé bloquée ou expirée ; les dépenses du jour au-dessus de votre **alerte quotidienne**. Une seule fois par fenêtre budgétaire, même entre les sessions |
| | **Bannière de dépassement de budget** | un bandeau rouge au-dessus du prompt qui **reste tant qu'un budget est épuisé** (clé, utilisateur, équipe, fenêtre ou modèle) et ne disparaît que lorsque les chiffres redeviennent normaux |
| 📊 **Rapporter** | **`/litellm pace`**, `usage`, `compare`, `day`, `status` | où va le budget, les jours et les modèles en tableaux, ce qui a changé par rapport aux jours précédents, un jour par modèle |
| | **`/litellm check`** | `OK`, `WARNING`, `CRITICAL` ou `UNKNOWN` **et le code de sortie d'une exécution `claude -p`** (0 à 3), pour les scripts et la supervision |
| | **`/litellm json`** / `csv` | tout en JSON, les jours en CSV ; **`copy`** place n'importe quel rapport dans le presse-papiers, **`share`** le remet à Claude pour l'interroger |
| 🛠️ **Gérer** *(admin)* | **`/litellm key new`** | créer une clé virtuelle ; le secret va dans votre **presse-papiers, jamais dans la transcription** |
| | **`/litellm grant`** | budget supplémentaire pour une clé, un utilisateur, une équipe ou une organisation, avec aperçu et confirmation |
| | **`/litellm key set`** / `reset-spend` | modifier les modèles, limites, expiration ou alias d'une clé ; remettre à zéro son compteur de dépenses |
| | **`/litellm key block`** / `unblock` | bloquer (ou rétablir) une clé en une ligne |
| | **`/litellm org`** | le budget d'une organisation, qu'une clé virtuelle ne peut pas lire |
| | **`/litellm keys`** | lister les clés : les vôtres, celles d'un utilisateur, d'une équipe, ou toutes |
| | **`/litellm fallbacks`** | les chaînes de fallback du routeur (`cloud/auto → cloud/auto-long → …`), ainsi que les fallbacks de fenêtre de contexte |

Chaque modification affiche d'abord un **aperçu**, demande confirmation dans la **boîte de dialogue native** de Claude Code, s'applique, puis **relit le résultat** auprès du proxy.

<a id="install"></a>

## Installation

Nécessite une version récente de Claude Code : le plugin utilise des function hooks (une API en accès anticipé), testé sur 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Pour l'essayer depuis un clone sans l'installer : `claude --plugin-dir ./plugins/litellm-key`.

Si Claude Code parle déjà à LiteLLM, **il n'y a rien à configurer** : le plugin lit la même URL et la même clé que Claude Code. Les commandes admin demandent aussi `litellm_admin_key` (voir [Commandes admin](#admin-commands)).

## Visite guidée

### Surveiller le budget

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code avec la barre d'état litellm-key sous le prompt" width="92%">
</p>

`/litellm models` liste ce que la clé peut appeler, `/litellm keys` les clés dont vous êtes propriétaire :

<p align="center">
  <img src="../evidence/keys.png" alt="Sortie de /litellm models et /litellm keys" width="92%">
</p>

### Regarder de près : usage, modèles, détails

Le volet a quatre onglets. Overview est le tableau de bord ci-dessus ; **Usage** dessine les 7, 14 ou 30 derniers jours en barres, en comptant dépenses, requêtes ou tokens, vous laisse choisir un jour pour voir ses modèles et dit quel modèle a bougé par rapport aux jours précédents :

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

**Models** liste ce que la clé peut appeler avec ce que chaque modèle a dépensé sur la période (triez par dépense ou par nom, et tapez dans le filtre pour réduire une longue liste) ; **Details** regroupe ce que le proxy a dit de la clé, la version et l'état de la base de données de LiteLLM, et le temps qu'a pris `/key/info`. La période, le tri et le graphique que vous choisissez sont conservés pour la prochaine fois, et `/litellm` ouvre le volet sur l'onglet où vous l'avez laissé.

### Demander un rapport, ou le remettre à un script

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

### Repérer les problèmes tôt, et les nommer

Le plugin distingue une clé bloquée d'une clé expirée ou d'une clé erronée, au lieu d'afficher un *401* générique :

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="86 % du budget utilisé"><br><sub><b>86 %</b> : toast d'avertissement et barre d'état</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="Budget dépassé"><br><sub><b>Budget dépassé</b> : un bandeau qui reste tant que le budget n'est pas redevenu normal</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="Clé bloquée"><br><sub>Clé <b>bloquée</b>, désignée comme telle</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="Clé expirée"><br><sub>Clé <b>expirée</b>, désignée comme telle</sub></td>
  </tr>
</table>

### Générer une clé

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="Confirmation native avant la création d'une clé"><br><sub>Aperçu, puis confirmation native de Claude Code</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="La clé a été copiée dans le presse-papiers"><br><sub>Le secret va dans le presse-papiers. La transcription ne voit que <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### Accorder un budget supplémentaire

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="Aperçu d'un octroi de budget"><br><sub><code>$25 → $35 (+$10)</code>, ce qui est dépensé, ce qu'il resterait</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="La clé a de nouveau de la marge après un octroi"><br><sub>Appliqué puis relu ; la barre d'état suit (101 % → 79 %)</sub></td>
  </tr>
</table>

### Quand l'équipe plafonne chaque membre

Une équipe peut plafonner ce que dépense chaque membre (`team_member_budget`). Le proxy refuse la requête alors que le budget propre de la clé est en règle, donc le plugin lit le plafond et l'affiche comme une jauge `Member`, et la bannière de dépassement de budget la nomme :

<p align="center">
  <img src="../evidence/member-cap.png" alt="Le volet avec une jauge Member au-delà de son plafond, la bannière au-dessus du prompt et l'organisation de la clé nommée" width="92%">
</p>

<sub>Capture réalisée contre `dev/mock-litellm.py --scenario member`. Le proxy ne communique pas à une clé virtuelle le total d'un membre ; la jauge compte donc <b>la dépense de cette clé</b> et le dit. Elle peut afficher trop bas et, face à un plafond qui se réinitialise, trop haut (une réinitialisation remet à zéro la dépense du membre, pas celle de la clé) ; la bannière n'est donc déclenchée que pour un plafond qui ne se réinitialise jamais. L'organisation de la clé est nommée aussi ; son budget est réservé aux admins, <code>/litellm org</code> le lit.</sub>

### Lire les chaînes de fallback

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Savoir ce que coûte un modèle

<p align="center">
  <img src="../evidence/models-prices.png" alt="/litellm models avec le prix par million de tokens en entrée et en sortie et la fenêtre de contexte" width="92%">
</p>

### Et le proxy confirme

Tout ce qui précède, c'est la vraie interface d'administration de LiteLLM v1.99.1 qui reflète ce que le plugin a fait :

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="Interface LiteLLM, Virtual Keys"><br><sub>Clés créées et relevées depuis Claude Code ; une est expirée</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="Interface LiteLLM, Usage"><br><sub>Les dépenses apparaissent dans Usage</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="Interface LiteLLM, Internal Users"><br><sub>Le rôle proxy de l'utilisateur (<code>internal_user</code>, <code>proxy_admin</code>) est ce qu'affiche la ligne <b>Role</b> du volet</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Commandes

| Commande | Effet |
| --- | --- |
| `/litellm` | Ouvre le volet, sur l'onglet où vous l'avez laissé (et répond par un résumé d'une ligne). Sans écran : affiche cet onglet en texte. |
| `/litellm tab <name>` | Ouvre le volet sur `overview`, `usage`, `models` ou `details` (ou 1 à 4). |
| `/litellm refresh` | Relit immédiatement. |
| `/litellm info` | Affiche le résumé complet dans la transcription. |
| `/litellm status` | Affiche la barre d'état en texte. |
| `/litellm pace` | Où va le budget, ce qu'il peut dépenser par jour pour tenir, et la même chose pour l'équipe et l'utilisateur. |
| `/litellm usage [7\|14\|30]` | Les dépenses, requêtes et tokens par jour sous forme de tableau, avec les totaux et les modèles. |
| `/litellm compare [7\|14]` | Les derniers jours complets face au même nombre de jours précédents, dans l'ensemble et modèle par modèle. |
| `/litellm day [when]` | Un jour par modèle : `today`, `yesterday`, `2026-10-03`, `10-03` ou un jour de la semaine (`mon`). |
| `/litellm models [text]` | Liste les modèles que cette clé peut appeler, avec leur prix par million de tokens et leur fenêtre de contexte ; avec un texte, seulement ceux dont le nom le contient. |
| `/litellm check [warn%]` | `OK`, `WARNING`, `CRITICAL` ou `UNKNOWN`, et le code de sortie d'une exécution `claude -p` : 0, 1, 2, 3. Un budget au-dessus de son plafond, ou une clé que le proxy dit bloquée, expirée ou rejetée, est `CRITICAL` ; un proxy qui ne répond pas est `UNKNOWN`. |
| `/litellm json` | Tout ce que le plugin sait de la clé en JSON (sans la clé, sans le hash). |
| `/litellm csv [7\|14\|30]` | Les jours en CSV. |
| `/litellm copy [what]` | Place un rapport dans le presse-papiers : `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` ou `json`. |
| `/litellm share [what]` | Remet un rapport à Claude, hors de vue, pour que la question suivante puisse porter dessus. |
| `/litellm ping` | Essaie chaque endpoint que lit le plugin, avec son statut et son temps. |
| `/litellm debug` | Montre d'où viennent l'URL et les clés (toujours masquées), ce qui a été essayé, le résultat. |
| `/litellm close` | Ferme le volet. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Liste les clés. Par défaut : les clés de votre propre utilisateur. 🔐 |
| `/litellm key new <alias> [flags]` | Crée une clé. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Bloque ou rétablit une clé. 🔐 |
| `/litellm key set <alias\|hash> [flags]` | Modifie les modèles, limites, l'expiration ou l'alias d'une clé. 🔐 |
| `/litellm key reset-spend <alias\|hash>` | Remet à zéro le compteur de dépenses d'une clé. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | Ajoute du budget. 🔐 |
| `/litellm org [id\|alias]` | Le budget d'une organisation ; sans nom : l'organisation de la clé elle-même, sinon la liste. 🔐 |
| `/litellm fallbacks [model]` | Chaînes de fallback du routeur, éventuellement pour les modèles correspondant à un nom. 🔐 |

🔐 = commande admin, voir ci-dessous. Dans le volet (donnez-lui le focus par un clic ou `ctrl+x` `tab`) : `1` à `4` changent d'onglet, `r` rafraîchit, `c` copie l'onglet où vous êtes, `q` ferme, les flèches font défiler ; chaque bouton indique sa touche (`Refresh (r)`, `Copy (c)`, `Close (q)`). Sur Usage, `d` parcourt 7, 14 et 30 jours, `m` les dépenses, les requêtes et les tokens, `v` copie les jours en CSV ; sur Models, `s` trie et `f` va au filtre. `Esc` ferme aussi le volet lorsque le prompt est vide (sur Models, il ne fait que quitter le filtre).

Une commande mal tapée reçoit une suggestion (`Did you mean "usage"?`). Une commande qui ne peut pas faire ce qu'on lui demande le dit en une phrase, et celles faites pour les scripts (`check`, `json`, `csv`, `ping`) se terminent par le code de sortie 3 quand il n'y a rien à rapporter.

Le volet s'adapte à l'espace disponible : à côté de la conversation (plein écran, à partir de 110 colonnes), chaque jauge occupe deux lignes ; au-dessus du prompt, à partir de 122 colonnes, les jauges deviennent un tableau ; dans les terminaux plus étroits, il garde deux lignes par jauge, ou devient **compact** si vous activez `compact_pane`. À côté de la conversation, le volet affiche des sections titrées (`BUDGETS`, `KEY`, `LAST 7 DAYS`, `TOP MODELS`) et une lettre sous chaque jour de la semaine ; `TOP MODELS` classe les cinq modèles qui ont le plus dépensé, chacun avec sa part de la semaine sous forme de barre. Un nom long est coupé au milieu, de sorte que `claude-sonnet-4-5` et `claude-sonnet-4-6` restent distincts. La couleur n'est jamais le seul signal : `▲` signale un budget proche de son plafond, `✖` un budget épuisé, et un jour sans dépense est un `·`, jamais une barre courte.

**Runway.** La ligne `Runway` (dans le volet et dans `/litellm info`) compare le rythme des 7 derniers jours (moins de jours pour une clé plus récente, jamais moins d'un) au plafond : `lasts until the reset at $2.18/day`, ou `out in 2d 6h at $2.18/day · resets in 6d 12h` lorsque le budget serait épuisé avant. La barre d'état ajoute `out in 2d 6h at this pace` uniquement lorsque c'est imminent : avant la réinitialisation, ou dans les 3 jours pour une clé sans réinitialisation. Une clé sans plafond, une clé déjà épuisée et une clé dont la réinitialisation est échue ne reçoivent aucune prévision.

<p align="center">
  <img src="../evidence/runway.png" alt="Le volet d'une clé en passe d'être épuisée : la ligne Runway et la barre d'état avertissent, et la semaine est répartie par modèle" width="92%">
</p>

<sub>Capture réalisée contre `dev/mock-litellm.py --scenario warning` : le laboratoire local n'a pas une semaine d'historique sur laquelle fonder une prévision.</sub>

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>

## Commandes admin

La lecture et la modification des clés exigent un admin du proxy. Définissez l'option **`litellm_admin_key`** (stockée dans le gestionnaire d'identifiants de votre OS, jamais dans `settings.json`). Sans elle, le plugin essaie avec votre clé virtuelle et, si le proxy refuse, vous le dit explicitement.

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

| Flag `key new` | Signification |
| --- | --- |
| `--budget 10` | Plafond de dépense en dollars. |
| `--every 30d` | Fenêtre budgétaire : elle se réinitialise tous les 30 jours (`s m h d w mo`). |
| `--soft 8` | Seuil d'alerte souple. |
| `--models a,b` | Modèles que la clé peut appeler (par défaut : tous). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Limites de débit. |
| `--expires 30d` | La clé cesse de fonctionner passé ce délai. |
| `--user ID` / `--team ID` | À qui elle appartient (et dont le budget s'applique aussi). |

| Flag `key set` | Signification |
| --- | --- |
| `--models a,b` / `--models all` | Remplace les modèles que la clé peut appeler (`all` : tous les modèles). |
| `--rpm N` / `--tpm N` / `--parallel N` | Fixe une limite ; `none` la supprime. |
| `--expires 30d` / `--expires never` | Expire après ce délai à partir de maintenant, ou jamais. |
| `--alias NEW` | Renomme la clé. |

Un champ que vous omettez reste tel quel. L'aperçu montre `before → after` pour chaque champ et prévient quand la clé est celle que Claude Code utilise.

Garde-fous, sur chaque commande admin :

- **Aperçu d'abord.** `--dry-run` s'arrête là ; `--yes` saute la confirmation ; sinon la boîte de dialogue native de Claude Code demande (**Apply** / **Cancel**).
- **Relecture.** Après un octroi, le plugin relit le budget auprès du proxy et rapporte ce qui s'y *trouve*, pas ce qu'il a envoyé.
- **Le nouveau secret n'atterrit jamais dans la transcription.** Il va dans le presse-papiers. Si le presse-papiers ne peut pas le recevoir, la clé est **supprimée à nouveau** (rollback) plutôt que conservée illisible. `--reveal` l'affiche, avec un avertissement indiquant qu'il est désormais enregistré dans la transcription.
- **Les valeurs `sk-…` brutes sont refusées** comme références de clé : utilisez un alias ou le hash de la clé. Les flags inconnus sont des erreurs, pas ignorés en silence.
- **Des chiffres honnêtes.** `grant` signale quand la dépense dépasse déjà le nouveau budget, quand il n'y a pas de plafond auquel ajouter (utilisez `--set`), quand rien ne changerait, et quand `--user` créerait un utilisateur que le proxy n'a jamais vu.
- **La clé admin** n'est envoyée qu'au proxy qui a déjà accepté la propre clé de votre session, et n'est jamais affichée (les erreurs sont expurgées).

Ce que l'on *peut* accorder aujourd'hui comme budget supplémentaire, sur LiteLLM v1.99.1 et v1.104.0 : relever le budget d'une **clé**, d'un **utilisateur** ou d'une **équipe** (`--team`, qui exige un admin du proxy), sous forme d'incrément ou de valeur absolue (`--set`). Un budget d'**organisation** (`--org`) fonctionne jusqu'à la v1.101 ; à partir de la v1.102, le proxy réserve les organisations aux licences enterprise et le plugin le dit. Une augmentation de budget *temporaire* (`temp_budget_increase`) et les budgets par modèle sont réservés à l'édition enterprise côté proxy (voir [Budgets](#budgets-what-litellm-can-and-cannot-do)) : le plugin ne les propose donc pas, plutôt que de faire semblant.

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## Budgets : ce que LiteLLM peut et ne peut pas faire

Vérifié en direct sur LiteLLM v1.99.1 (proxy open source, sans licence) ; le plafond par membre et les organisations ont aussi été vérifiés sur la v1.104.0 :

| Budget | Ça marche ? | Comment |
| --- | --- | --- |
| Par **clé** (plafond + fenêtre de réinitialisation) | ✅ | `/litellm key new --budget 10 --every 30d` ; relever avec `/litellm grant 5 --key NAME` |
| Par **utilisateur** | ✅ | `/litellm grant 5 --user ID` (s'applique à chaque clé dont l'utilisateur est propriétaire) |
| Par **équipe** | ✅ | `/litellm grant 50 --team NAME` (exige un admin du proxy) |
| Par **membre** d'une équipe (`team_member_budget`) | 👀 lecture seule | bloque les requêtes de l'utilisateur dans cette équipe (HTTP 429, 422 à partir de la v1.104). Le volet affiche le plafond sous la forme `Member…` ; définissez-le dans l'interface ou l'API de LiteLLM. Une clé virtuelle ne peut pas lire le total du membre : la jauge compte donc la **dépense de cette clé** et le dit. Une réinitialisation remet à zéro la dépense du membre mais pas celle de la clé ; la bannière de dépassement de budget n'est donc déclenchée que pour un plafond qui ne se réinitialise jamais, et face à un plafond qui se réinitialise la jauge avertit sans affirmer un blocage |
| Par **organisation** | ✅ jusqu'à la v1.101 · ⛔ enterprise à partir de la v1.102 | bloque toutes les clés qu'elle contient (HTTP 429). Une clé virtuelle ne peut pas le lire : le volet nomme l'organisation, `/litellm org` affiche le budget (admin), `grant --org` le relève |
| Plusieurs fenêtres sur une même clé (`budget_limits`, p. ex. $5/heure + $50/mois) | lecture seule | affichées comme jauges `Window 1h` quand le proxy en a |
| Par **modèle** sur une clé (`model_max_budget`) | ⛔ enterprise | le proxy répond *"You must have an enterprise license to set model_max_budget"*, y compris pour `/budget/new`. Si votre proxy a la licence, le volet affiche ces jauges (`Model gpt-4o`) |
| Augmentation temporaire de budget (`temp_budget_increase`) | ⛔ enterprise | le proxy open source accepte le champ et ne l'applique jamais |

**Budget par modèle sans la licence :** créez une clé par modèle, chacune avec son propre plafond, p. ex.
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. La clé ne peut appeler que ce modèle et s'arrête à $5.

## Configuration

Le plugin lit la même URL et la même clé que Claude Code, dans cet ordre (d'abord les variables du processus, puis le bloc `env` de `settings.json`) :

| Quoi | Source |
| --- | --- |
| URL | option `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Clé | option `litellm_key`, l'en-tête `x-litellm-api-key` dans `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

Si l'URL se termine par une route pass-through (`/anthropic`, `/bedrock`, `/v1`…), le plugin essaie aussi la racine du proxy. Une clé n'est utilisée qu'avec l'URL à laquelle elle appartient : les clés d'environnement ne partent jamais vers un `litellm_url` situé sur un autre hôte, et `LITELLM_PROXY_API_BASE` ne s'associe qu'à `LITELLM_PROXY_API_KEY`.

Toutes les options sont facultatives (à l'installation, Claude Code indique qu'elles sont « not set » ; c'est sans conséquence). Modifiez-les avec `/plugin configure litellm-key@cc-litellm`, ou avec `claude plugin configure litellm-key@cc-litellm --values-stdin` et un objet JSON de chaînes.

| Option | Défaut | Rôle |
| --- | --- | --- |
| `litellm_url` | vide | Un proxy placé ailleurs qu'à l'emplacement par défaut (Bedrock/Vertex via LiteLLM, URL avec préfixe). |
| `litellm_key` | vide | Une clé explicite. 🔒 stockée dans le gestionnaire d'identifiants, pas dans `settings.json`. |
| `litellm_admin_key` | vide | Clé admin pour `keys`, `key new/set/reset-spend/block/unblock`, `grant`, `org`, `fallbacks`. 🔒 même stockage. Jamais affichée. |
| `refresh_seconds` | 60 | Intervalle de lecture (15 à 3600). Lit aussi après chaque tour, au plus toutes les 20 s. |
| `warn_percent` | 80 | Premier avertissement de budget (il avertit aussi à 95 % et 100 %). |
| `daily_alert` | 0 (désactivée) | Avertit quand les dépenses du jour de la clé atteignent ce nombre de dollars : un toast par jour, la barre d'état et le volet. Quand elle est active, l'historique d'usage est lu toutes les 3 minutes. |
| `show_toasts` | oui | Les toasts qui avertissent du budget, de l'alerte quotidienne, d'une clé qui va expirer et d'un proxy qui échoue. Désactivés, les avertissements restent dans la barre d'état et le volet. |
| `show_status_line` | oui | La ligne sous le prompt. |
| `show_related` | oui | Lit `/user/info` et `/team/info` : ces budgets peuvent aussi bloquer des requêtes. |
| `show_usage` | oui | Lit `/user/daily/activity` (un endpoint LiteLLM en bêta) : les 30 derniers jours d'usage, sur lesquels s'appuient les onglets Usage et Models, les rapports, le runway et l'alerte quotidienne. |
| `compact_pane` | non | Volet compact au-dessus du prompt dans les terminaux étroits (74 à 121 colonnes) : une jauge par ligne, les informations côte à côte. |

## D'où viennent les données

**Surveiller** ne fait que lire (`GET`), toujours avec votre propre clé :

| Endpoint | Rôle |
| --- | --- |
| `/key/info` | Alias, dépense, budget et fenêtres, réinitialisation, limites, expiration, statut, modèles, budgets par modèle. À chaque lecture. |
| `/user/info`, `/team/info` | Budget de l'utilisateur et de l'équipe de la clé, et plafond par membre de l'équipe, lorsqu'ils sont plafonnés. À chaque lecture. |
| `/v1/models` | Les modèles réellement autorisés. Toutes les 10 min. |
| `/model_group/info` | Prix par token et fenêtre de contexte de ces modèles (le proxy répond pour tous ses modèles ; le plugin conserve ceux qui sont autorisés). Toutes les 10 min. |
| `/user/daily/activity` | Dépenses, requêtes, tokens et modèles des 30 derniers jours, jour par jour. Toutes les 10 min. |
| `/health/readiness` | La version de LiteLLM et si sa base de données est connectée. Toutes les 10 min ; quand le proxy ne le dit pas, rien n'est affiché, pas même une note. |

Les lectures marquées « toutes les 10 min » ont lieu toutes les 3 minutes tant qu'un `daily_alert` est défini : les dépenses du jour sont ce qu'il surveille.

**Gérer** n'intervient que lorsque vous saisissez une commande admin : `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/organization/info`, `/organization/list`, `/router/settings`, et `POST /key/generate`, `/key/delete` (rollback uniquement), `/key/block`, `/key/unblock`, `/key/update`, `/key/{hash}/reset_spend`, `/user/update`, `/team/update`, `PATCH /organization/update`.

Chaque requête attend au plus 4 s (15 s pour les commandes admin). Une lecture optionnelle qui échoue (403, 404…) devient une note discrète dans le volet, jamais une erreur. Si le proxy tombe, le volet conserve la dernière lecture valide, marquée comme périmée. LiteLLM écrit les dépenses dans sa base par lots : les chiffres ont donc environ 10 secondes de retard sur une requête.

## Confidentialité et sécurité

- Votre clé ne voyage que vers le proxy que Claude Code utilise déjà, dans l'en-tête `Authorization` (ou `x-litellm-api-key`). Jamais dans une URL, un log, un toast, l'état ou le stockage du plugin ; les messages d'erreur passent par un filtre qui la masque.
- La clé admin n'est envoyée qu'à la racine du proxy qui a déjà accepté la clé de votre session, et seulement lorsque vous saisissez une commande admin.
- Le plugin ne stocke que les identifiants des avertissements déjà affichés, pour ne pas les répéter.
- `litellm-key` lit `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` et `LITELLM_PROXY_API_KEY`, le bloc `env` de `settings.json`, et effectue des requêtes HTTP. `claude plugin validate plugins/litellm-key` énumère tout cela.

## Si quelque chose ne s'affiche pas

| Symptôme | Cause probable |
| --- | --- |
| Rien dans la barre d'état, le toast indique « not configured » | Claude Code n'est pas derrière un proxy (`ANTHROPIC_BASE_URL` absent ou `api.anthropic.com`). |
| « The proxy has no database record for this key » | C'est la clé maître, ou une clé définie uniquement dans `config.yaml`. Seules les clés créées avec `/key/generate` ont des données. |
| « The proxy has no database » | Le proxy tourne sans `DATABASE_URL` : il n'y a pas de clés virtuelles à lire. |
| « does not look like a LiteLLM proxy » | L'URL pointe vers autre chose. Définissez `litellm_url` sur la racine du proxy. |
| « key blocked » / « key expired » | Exactement cela. Demandez à un admin, ou lancez `/litellm key unblock` depuis une autre session. |
| « key rejected (401) » | Clé invalide. |
| L'historique d'usage est absent | La clé n'a pas de `user_id`, ou l'endpoint bêta n'existe pas dans votre version de LiteLLM. |
| Une commande admin indique qu'elle a besoin d'une clé admin | Définissez `litellm_admin_key`. |
| Une commande admin attend « until the proxy accepts this session's key » | Par conception, la clé admin n'est envoyée qu'à un proxy qui a accepté votre propre clé. Corrigez cette clé depuis une autre session ou depuis l'interface LiteLLM. |

`/litellm debug` montre ce que le plugin a résolu.

## Essayer avec un vrai LiteLLM sur votre portable

`dev/litellm` est un labo complet : LiteLLM v1.104.0 avec Postgres 18 dans Docker, de sorte que les clés virtuelles, les budgets et les dépenses sont réels. La CI le démarre et lance le smoke test à chaque changement.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (par défaut) reproduit une vraie configuration « auto » : un groupe `cloud/auto` pondéré, une chaîne de fallback, un fallback de fenêtre de contexte et un modèle (`demo/always-429`) qui échoue toujours pour que le routeur bascule de façon visible. Rien ne quitte votre machine.
- **Le routage de votre propre cluster :** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` lit (en lecture seule, via `kubectl`) le `config.yaml` de votre proxy et **uniquement** les variables de fournisseur qu'il référence, puis écrit un `config.cluster.yaml` + `.env` locaux (ignorés par git : ne les commitez jamais). Ensuite : `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`** est un minuscule faux proxy pour les états de l'interface (`--scenario warning|blocked|…`), sans Docker.
- **`dev/evidence/`** est le harnais qui a produit chaque capture d'écran de ce README : un vrai Claude Code dans un ConPTY, rendu en PNG. Voir [`dev/evidence/README.md`](../../dev/evidence/README.md).

## Développement

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Structure du plugin : `hooks/register.tsx` est le seul fichier qui touche au `$` de Claude Code ; il construit les ports injectés (`hooks/ports.ts`) et câble les événements, les commandes, les minuteurs et les toasts. Tout le reste est constitué de fonctions simples qui reçoivent ces ports, ce qui leur permet de s'exécuter en test sans démarrer le moteur. `hooks/session.ts` est le cycle de lecture (configuration, ticker, rafraîchissement forcé mis en file d'attente) ; `hooks/credentials.ts` et `hooks/settings.ts` résolvent la clé et les options ; `hooks/litellm.ts` lit le proxy, `hooks/parsers.ts` et `hooks/json.ts` normalisent les réponses et `hooks/failures.ts` nomme ce qui a mal tourné ; `hooks/alerts.ts` décide des toasts. `hooks/commands.ts` est la table des commandes `/litellm` et `hooks/admin*.ts` les commandes admin (`admin.ts` pour les lectures du proxy, `admin-targets.ts` pour les recherches de clé, d'utilisateur et d'équipe, `admin-writes.ts` pour ses écritures, `admin-plan.ts` pour les aperçus et les plans, `admin-link.ts` pour le lien de la clé admin avec le proxy, `admin-commands.ts` pour le flux, `args.ts` pour l'analyseur d'arguments). `hooks/exceeded.ts` et `hooks/band.tsx` forment la bannière de dépassement de budget ; `hooks/summary.ts` construit le texte, `hooks/view.tsx` et `hooks/parts.tsx` le volet (cadran, titres de section, pastille d'état, lignes de jauge) ; `hooks/format.ts` contient les formateurs purs ; `types/index.d.ts` est le contrat d'état. Les onglets sont `hooks/tab-*.tsx` (`tab-overview.tsx` est le tableau de bord qu'avait le volet avant les onglets, `parts-tabs.tsx` leurs parties communes, `chart.ts` les barres) ; les rapports sont `hooks/report-*.ts`, `details.ts` et `probe.ts` (`/litellm ping`), au-dessus de `history.ts` (les 30 jours, totaux et comparaisons) et `guidance.ts` (allowance, headroom, today et la session). `hooks/commands-reports.ts` et `commands-share.ts` sont les commandes qui affichent ou remettent un rapport.

## Limites connues

- `apiKeyHelper` n'est pas lu (exécuter une commande de l'utilisateur est hors périmètre). Utilisez `litellm_key`.
- `/user/daily/activity` est en bêta dans LiteLLM et peut changer.
- Les budgets par modèle (`model_max_budget`), les augmentations temporaires de budget et la régénération de clé sont réservés à l'édition enterprise côté proxy : ils ne sont donc pas proposés (voir [Budgets](#budgets-what-litellm-can-and-cannot-do)). Modifier les chaînes de fallback exige `STORE_MODEL_IN_DB=True` sur le proxy ; `/litellm fallbacks` reste donc en lecture seule.
- Le budget d'une **organisation** ne figure pas dans la réponse de la clé elle-même et une clé virtuelle peut ne pas pouvoir le lire : le volet se contente donc de nommer l'organisation ; `/litellm org` le lit avec une clé admin. La clé admin n'est toujours envoyée que lorsque vous saisissez une commande admin, jamais sur le minuteur de rafraîchissement.
- Le total d'un **membre** de l'équipe n'est pas communiqué à une clé virtuelle : la jauge `Member` ne compte que la dépense de cette clé et peut donc indiquer trop peu : si l'utilisateur a plusieurs clés dans l'équipe, le proxy peut bloquer plus tôt que ne l'indique la jauge. Face à un plafond qui se réinitialise, elle peut aussi afficher trop haut (une réinitialisation remet à zéro la dépense du membre, pas celle de la clé) ; elle avertit alors et la bannière reste silencieuse.
- L'historique d'usage lit une page des lignes d'activité du proxy ; quand il y en a davantage, le volet indique qu'il est partiel. Les jours sont en UTC, comme le proxy les compte ; celui d'aujourd'hui est encore en cours, donc les comparaisons l'écartent.
- La ligne **Session** compte de combien les dépenses de la clé ont augmenté depuis la première lecture de cette session de Claude Code. Elle ne peut pas distinguer les dépenses de cette session de celles d'une autre session avec la même clé.
- La bannière de dépassement de budget s'affiche sur les surfaces terminal et bureau (Claude Code n'y propose le bandeau que là) ; ailleurs, la barre d'état et le volet le signalent.
- Le `⚠` devant la barre d'état est dessiné par Claude Code pour chaque entrée d'état de plugin ; il ne signifie pas que la clé a un problème (c'est le texte qui le dit).
- L'API de plugins de Claude Code est en accès anticipé et peut changer d'une version à l'autre.

## Licence

[MIT](../../LICENSE).

## Autres langues

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · **Français** · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
