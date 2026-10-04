<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm : votre clé LiteLLM, votre budget et vos fallbacks dans Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Plugin Claude Code" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20tested-6366f1?style=for-the-badge">
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

Un plugin [Claude Code](https://code.claude.com) pour celles et ceux qui accèdent à leurs modèles via un **proxy [LiteLLM](https://docs.litellm.ai)**. Il affiche ce que le proxy sait de la **clé virtuelle** utilisée par Claude Code (budget, dépenses, limites, expiration, modèles, usage sur 7 jours) et, pour les admins, permet de **créer des clés, d'accorder un budget supplémentaire, de bloquer une clé et de lire les chaînes de fallback du routeur** sans quitter le terminal.

Ce dépôt est une marketplace de plugins (`cc-litellm`) qui contient un seul plugin : [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="Le volet /litellm à côté de la conversation, face à un vrai proxy LiteLLM" width="92%">
</p>

## Ce que vous obtenez

| | | |
| --- | --- | --- |
| 👀 **Surveiller** | **Barre d'état** sous le prompt, toujours visible | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **Volet `/litellm`** | jauges des budgets de la clé, de l'équipe et de l'utilisateur, **rôle** de l'utilisateur, limites, expiration, modèles, sparkline sur 7 jours, le **top des modèles** de la semaine et une prévision de **runway** ; se rafraîchit tout seul |
| | **Notifications toast** | à 80 % (configurable), 95 %, 100 % ; clé sur le point d'expirer ; clé bloquée ou expirée. Une seule fois par fenêtre budgétaire, même entre les sessions |
| | **Bannière de dépassement de budget** | un bandeau rouge au-dessus du prompt qui **reste tant qu'un budget est épuisé** (clé, utilisateur, équipe, fenêtre ou modèle) et ne disparaît que lorsque les chiffres redeviennent normaux |
| 🛠️ **Gérer** *(admin)* | **`/litellm key new`** | créer une clé virtuelle ; le secret va dans votre **presse-papiers, jamais dans la transcription** |
| | **`/litellm grant`** | budget supplémentaire pour une clé, un utilisateur ou une équipe, avec aperçu et confirmation |
| | **`/litellm key block`** / `unblock` | bloquer (ou rétablir) une clé en une ligne |
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

### Lire les chaînes de fallback

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
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
| `/litellm` | Ouvre le volet (et répond par un résumé d'une ligne). Sans écran : affiche le résumé. |
| `/litellm refresh` | Relit immédiatement. |
| `/litellm info` | Affiche le résumé complet dans la transcription. |
| `/litellm models` | Liste les modèles que cette clé peut appeler. |
| `/litellm debug` | Montre d'où viennent l'URL et les clés (toujours masquées), ce qui a été essayé, le résultat. |
| `/litellm close` | Ferme le volet. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Liste les clés. Par défaut : les clés de votre propre utilisateur. 🔐 |
| `/litellm key new <alias> [flags]` | Crée une clé. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Bloque ou rétablit une clé. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team] [--set]` | Ajoute du budget. 🔐 |
| `/litellm fallbacks [model]` | Chaînes de fallback du routeur, éventuellement pour les modèles correspondant à un nom. 🔐 |

🔐 = commande admin, voir ci-dessous. Dans le volet (donnez-lui le focus par un clic ou `ctrl+x` `tab`) : `r` rafraîchit, `c` copie le résumé, `q` ferme, les flèches font défiler ; chaque bouton indique sa touche (`Refresh (r)`, `Copy (c)`, `Close (q)`). `Esc` le ferme aussi lorsque le prompt est vide.

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

Garde-fous, sur chaque commande admin :

- **Aperçu d'abord.** `--dry-run` s'arrête là ; `--yes` saute la confirmation ; sinon la boîte de dialogue native de Claude Code demande (**Apply** / **Cancel**).
- **Relecture.** Après un octroi, le plugin relit le budget auprès du proxy et rapporte ce qui s'y *trouve*, pas ce qu'il a envoyé.
- **Le nouveau secret n'atterrit jamais dans la transcription.** Il va dans le presse-papiers. Si le presse-papiers ne peut pas le recevoir, la clé est **supprimée à nouveau** (rollback) plutôt que conservée illisible. `--reveal` l'affiche, avec un avertissement indiquant qu'il est désormais enregistré dans la transcription.
- **Les valeurs `sk-…` brutes sont refusées** comme références de clé : utilisez un alias ou le hash de la clé. Les flags inconnus sont des erreurs, pas ignorés en silence.
- **Des chiffres honnêtes.** `grant` signale quand la dépense dépasse déjà le nouveau budget, quand il n'y a pas de plafond auquel ajouter (utilisez `--set`), quand rien ne changerait, et quand `--user` créerait un utilisateur que le proxy n'a jamais vu.
- **La clé admin** n'est envoyée qu'au proxy qui a déjà accepté la propre clé de votre session, et n'est jamais affichée (les erreurs sont expurgées).

Ce que l'on *peut* accorder aujourd'hui comme budget supplémentaire, sur LiteLLM v1.99.1 : relever le budget d'une **clé**, d'un **utilisateur** ou d'une **équipe** (`--team`, qui exige un admin du proxy), sous forme d'incrément ou de valeur absolue (`--set`). Une augmentation de budget *temporaire* (`temp_budget_increase`) et les budgets par modèle sont réservés à l'édition enterprise côté proxy (voir [Budgets](#budgets-what-litellm-can-and-cannot-do)) : le plugin ne les propose donc pas, plutôt que de faire semblant.

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## Budgets : ce que LiteLLM peut et ne peut pas faire

Vérifié en direct sur LiteLLM v1.99.1 (proxy open source, sans licence) :

| Budget | Ça marche ? | Comment |
| --- | --- | --- |
| Par **clé** (plafond + fenêtre de réinitialisation) | ✅ | `/litellm key new --budget 10 --every 30d` ; relever avec `/litellm grant 5 --key NAME` |
| Par **utilisateur** | ✅ | `/litellm grant 5 --user ID` (s'applique à chaque clé dont l'utilisateur est propriétaire) |
| Par **équipe** | ✅ | `/litellm grant 50 --team NAME` (exige un admin du proxy) |
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
| `litellm_admin_key` | vide | Clé admin pour `keys`, `key new/block/unblock`, `grant`, `fallbacks`. 🔒 même stockage. Jamais affichée. |
| `refresh_seconds` | 60 | Intervalle de lecture (15 à 3600). Lit aussi après chaque tour, au plus toutes les 20 s. |
| `warn_percent` | 80 | Premier avertissement de budget (il avertit aussi à 95 % et 100 %). |
| `show_status_line` | oui | La ligne sous le prompt. |
| `show_related` | oui | Lit `/user/info` et `/team/info` : ces budgets peuvent aussi bloquer des requêtes. |
| `show_usage` | oui | Lit `/user/daily/activity` (un endpoint LiteLLM en bêta) pour l'usage sur 7 jours. |
| `compact_pane` | non | Volet compact au-dessus du prompt dans les terminaux étroits (74 à 121 colonnes) : une jauge par ligne, les informations côte à côte. |

## D'où viennent les données

**Surveiller** ne fait que lire (`GET`), toujours avec votre propre clé :

| Endpoint | Rôle |
| --- | --- |
| `/key/info` | Alias, dépense, budget et fenêtres, réinitialisation, limites, expiration, statut, modèles, budgets par modèle. À chaque lecture. |
| `/user/info`, `/team/info` | Budget de l'utilisateur et de l'équipe de la clé, lorsqu'il est plafonné. À chaque lecture. |
| `/v1/models` | Les modèles réellement autorisés. Toutes les 10 min. |
| `/user/daily/activity` | Dépense, requêtes et tokens des 7 derniers jours, et la dépense par modèle. Toutes les 10 min. |

**Gérer** n'intervient que lorsque vous saisissez une commande admin : `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/router/settings`, et `POST /key/generate`, `/key/delete` (rollback uniquement), `/key/block`, `/key/unblock`, `/key/update`, `/user/update`, `/team/update`.

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
| L'historique sur 7 jours est absent | La clé n'a pas de `user_id`, ou l'endpoint bêta n'existe pas dans votre version de LiteLLM. |
| Une commande admin indique qu'elle a besoin d'une clé admin | Définissez `litellm_admin_key`. |
| Une commande admin attend « until the proxy accepts this session's key » | Par conception, la clé admin n'est envoyée qu'à un proxy qui a accepté votre propre clé. Corrigez cette clé depuis une autre session ou depuis l'interface LiteLLM. |

`/litellm debug` montre ce que le plugin a résolu.

## Essayer avec un vrai LiteLLM sur votre portable

`dev/litellm` est un labo complet : LiteLLM v1.99.1 avec Postgres dans Docker, de sorte que les clés virtuelles, les budgets et les dépenses sont réels.

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

Structure du plugin : `hooks/register.tsx` est le seul fichier qui touche au `$` de Claude Code ; il construit les ports injectés (`hooks/ports.ts`) et câble les événements, les commandes, les minuteurs et les toasts. Tout le reste est constitué de fonctions simples qui reçoivent ces ports, ce qui leur permet de s'exécuter en test sans démarrer le moteur. `hooks/session.ts` est le cycle de lecture (configuration, ticker, rafraîchissement forcé mis en file d'attente) ; `hooks/credentials.ts` et `hooks/settings.ts` résolvent la clé et les options ; `hooks/litellm.ts` lit le proxy, `hooks/parsers.ts` et `hooks/json.ts` normalisent les réponses et `hooks/failures.ts` nomme ce qui a mal tourné ; `hooks/alerts.ts` décide des toasts. `hooks/commands.ts` est la table des commandes `/litellm` et `hooks/admin*.ts` les commandes admin (`admin.ts` pour les lectures du proxy, `admin-targets.ts` pour les recherches de clé, d'utilisateur et d'équipe, `admin-writes.ts` pour ses écritures, `admin-plan.ts` pour les aperçus et les plans, `admin-link.ts` pour le lien de la clé admin avec le proxy, `admin-commands.ts` pour le flux, `args.ts` pour l'analyseur d'arguments). `hooks/exceeded.ts` et `hooks/band.tsx` forment la bannière de dépassement de budget ; `hooks/summary.ts` construit le texte, `hooks/view.tsx` et `hooks/parts.tsx` le volet (cadran, titres de section, pastille d'état, lignes de jauge) ; `hooks/format.ts` contient les formateurs purs ; `types/index.d.ts` est le contrat d'état.

## Limites connues

- `apiKeyHelper` n'est pas lu (exécuter une commande de l'utilisateur est hors périmètre). Utilisez `litellm_key`.
- `/user/daily/activity` est en bêta dans LiteLLM et peut changer.
- Les budgets par modèle (`model_max_budget`), les augmentations temporaires de budget et la régénération de clé sont réservés à l'édition enterprise côté proxy : ils ne sont donc pas proposés (voir [Budgets](#budgets-what-litellm-can-and-cannot-do)).
- La bannière de dépassement de budget s'affiche sur les surfaces terminal et bureau (Claude Code n'y propose le bandeau que là) ; ailleurs, la barre d'état et le volet le signalent.
- Le `⚠` devant la barre d'état est dessiné par Claude Code pour chaque entrée d'état de plugin ; il ne signifie pas que la clé a un problème (c'est le texte qui le dit).
- L'API de plugins de Claude Code est en accès anticipé et peut changer d'une version à l'autre.

## Licence

[MIT](../../LICENSE).

## Autres langues

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · **Français** · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
