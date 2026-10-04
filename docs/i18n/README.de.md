<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm: dein LiteLLM-Key, Budget und Fallbacks direkt in Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude-Code-Plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
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
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <b>Deutsch</b> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> Dies ist eine Übersetzung der englischen README. Wenn sich die Versionen unterscheiden, gilt die englische als maßgeblich.

# cc-litellm

Ein [Claude-Code](https://code.claude.com)-Plugin für alle, die ihre Modelle über einen **[LiteLLM](https://docs.litellm.ai)-Proxy** nutzen. Es zeigt, was der Proxy über den **virtuellen Key** weiß, den Claude Code verwendet (Budget, Verbrauch, Limits, Ablauf, Modelle, Nutzung der letzten 7 Tage). Admins können außerdem **Keys anlegen, zusätzliches Budget vergeben, einen Key sperren und die Fallback-Ketten des Routers lesen**, ohne das Terminal zu verlassen.

Dieses Repository ist ein Plugin-Marketplace (`cc-litellm`) mit einem Plugin: [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="Das /litellm-Panel neben der Unterhaltung, gegen einen echten LiteLLM-Proxy" width="92%">
</p>

## Das bekommst du

| | | |
| --- | --- | --- |
| 👀 **Beobachten** | **Statuszeile** unter dem Prompt, immer sichtbar | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm`-Panel** | Balken für Key-, Team- und User-Budgets, die **Rolle** des Users, Limits, Ablauf, Modelle, 7-Tage-Sparkline; aktualisiert sich selbst |
| | **Toasts** | bei 80 % (konfigurierbar), 95 %, 100 %; Key läuft bald ab; Key gesperrt oder abgelaufen. Einmal pro Budgetfenster, auch über Sessions hinweg |
| | **Banner bei Budgetüberschreitung** | ein rotes Band über dem Prompt, das **so lange bleibt, wie ein Budget aufgebraucht ist** (Key, User, Team, Fenster oder Modell) und erst verschwindet, wenn die Zahlen wieder normal sind |
| 🛠️ **Verwalten** *(Admin)* | **`/litellm key new`** | einen virtuellen Key anlegen; das Secret landet in deiner **Zwischenablage, nie im Transkript** |
| | **`/litellm grant`** | zusätzliches Budget für einen Key, einen User oder ein Team, mit Vorschau und Bestätigung |
| | **`/litellm key block`** / `unblock` | einen Key mit einer Zeile stoppen (oder wieder freigeben) |
| | **`/litellm keys`** | Keys auflisten: deine, die eines Users, die eines Teams oder alle |
| | **`/litellm fallbacks`** | die Fallback-Ketten des Routers (`cloud/auto → cloud/auto-long → …`) plus Context-Window-Fallbacks |

Jede Änderung zeigt zuerst eine **Vorschau**, fragt im **nativen Dialog** von Claude Code nach, wird angewendet und **liest das Ergebnis anschließend vom Proxy zurück**.

<a id="install"></a>
## Installation

Braucht ein aktuelles Claude Code: Das Plugin nutzt Function Hooks (eine Early-Access-API), getestet mit 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Zum Ausprobieren aus einem Clone, ohne Installation: `claude --plugin-dir ./plugins/litellm-key`.

Wenn Claude Code bereits mit LiteLLM spricht, **musst du nichts konfigurieren**: Das Plugin liest dieselbe URL und denselben Key wie Claude Code. Admin-Befehle brauchen zusätzlich `litellm_admin_key` (siehe [Admin-Befehle](#admin-commands)).

## Ein Rundgang

### Das Budget im Blick

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code mit der Statuszeile von litellm-key unter dem Prompt" width="92%">
</p>

`/litellm models` listet auf, was der Key aufrufen darf, `/litellm keys` die Keys, die dir gehören:

<p align="center">
  <img src="../evidence/keys.png" alt="Ausgabe von /litellm models und /litellm keys" width="92%">
</p>

### Probleme früh erkennen und beim Namen nennen

Das Plugin unterscheidet einen gesperrten Key von einem abgelaufenen und von einem falschen, statt nur ein generisches *401* zu melden:

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="86 % des Budgets verbraucht"><br><sub><b>86 %</b>: Warn-Toast und Statuszeile</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="Budget überschritten"><br><sub><b>Budget überschritten</b>: ein Banner, das bleibt, bis das Budget wieder normal ist</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="Key gesperrt"><br><sub><b>Gesperrter</b> Key, als gesperrt benannt</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="Key abgelaufen"><br><sub><b>Abgelaufener</b> Key, als abgelaufen benannt</sub></td>
  </tr>
</table>

### Einen Key erzeugen

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="Native Bestätigung vor dem Anlegen eines Keys"><br><sub>Vorschau, dann die native Bestätigung von Claude Code</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="Der Key wurde in die Zwischenablage kopiert"><br><sub>Das Secret landet in der Zwischenablage. Das Transkript sieht nur <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### Zusätzliches Budget vergeben

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="Vorschau einer Budgetvergabe"><br><sub><code>$25 → $35 (+$10)</code>, was verbraucht ist, was übrig bliebe</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="Der Key hat nach der Vergabe wieder Spielraum"><br><sub>Angewendet und zurückgelesen; die Statuszeile folgt (101 % → 79 %)</sub></td>
  </tr>
</table>

### Die Fallback-Ketten lesen

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Und der Proxy stimmt zu

Alles oben Gezeigte ist die echte Admin-UI von LiteLLM v1.99.1, die widerspiegelt, was das Plugin getan hat:

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="LiteLLM-UI, Virtual Keys"><br><sub>Aus Claude Code angelegte und aufgestockte Keys; einer ist abgelaufen</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="LiteLLM-UI, Usage"><br><sub>Der Verbrauch taucht unter Usage auf</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="LiteLLM-UI, Internal Users"><br><sub>Die Proxy-Rolle des Users (<code>internal_user</code>, <code>proxy_admin</code>) ist das, was die <b>Role</b>-Zeile des Panels zeigt</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `/litellm` | Öffnet das Panel (und antwortet mit einer einzeiligen Zusammenfassung). Ohne Bildschirm: gibt die Zusammenfassung aus. |
| `/litellm refresh` | Liest sofort neu. |
| `/litellm info` | Gibt die vollständige Zusammenfassung im Transkript aus. |
| `/litellm models` | Listet die Modelle auf, die dieser Key aufrufen kann. |
| `/litellm debug` | Zeigt, woher URL und Keys kommen (immer maskiert), was versucht wurde und das Ergebnis. |
| `/litellm close` | Schließt das Panel. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Listet Keys auf. Standard: die Keys deines eigenen Users. 🔐 |
| `/litellm key new <alias> [flags]` | Legt einen Key an. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Sperrt einen Key oder gibt ihn wieder frei. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team] [--set]` | Fügt Budget hinzu. 🔐 |
| `/litellm fallbacks [model]` | Fallback-Ketten des Routers, optional für Modelle, die zu einem Namen passen. 🔐 |

🔐 = Admin-Befehl, siehe unten. Im Panel (per Klick oder mit `ctrl+x` `tab` fokussieren): `r` aktualisiert, `c` kopiert die Zusammenfassung, `q` schließt, Pfeiltasten scrollen. `Esc` schließt es ebenfalls, wenn der Prompt leer ist.

Das Panel passt sich dem verfügbaren Platz an: Neben der Unterhaltung (Vollbild, ab 110 Spalten) belegt jeder Balken zwei Zeilen; über dem Prompt werden die Balken ab 122 Spalten zu einer Tabelle; in schmaleren Terminals bleibt es bei zwei Zeilen pro Balken oder wird **kompakt**, wenn du `compact_pane` aktivierst. Neben der Unterhaltung bekommt das Panel betitelte Abschnitte (`BUDGETS`, `KEY`, `LAST 7 DAYS`) und unter jedem Wochentag einen Buchstaben. Farbe ist nie das einzige Signal: `▲` markiert ein Budget, das kurz vor seiner Obergrenze steht, `✖` eines, das aufgebraucht ist, und ein Tag ohne Verbrauch ist ein `·`, nie ein kurzer Balken.

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>
## Admin-Befehle

Lesen und Ändern von Keys erfordert einen Proxy-Admin. Setze die Option **`litellm_admin_key`** (liegt im Credential Store deines Betriebssystems, nie in `settings.json`). Ohne sie versucht das Plugin es mit deinem virtuellen Key und sagt dir genau das, falls der Proxy ablehnt.

```text
/litellm key new ci-runner --budget 5 --every 7d --rpm 60 --user ana@example.com
/litellm key new batch --budget 20 --models cloud/auto,cloud/auto-long --expires 30d --team platform-eng
/litellm grant 10 --key claude-code-ana          # +$10 on top of the current budget
/litellm grant 200 --team platform-eng --set     # cap the team at exactly $200
/litellm key block old-contractor
/litellm fallbacks cloud/auto
```

| `key new`-Flag | Bedeutung |
| --- | --- |
| `--budget 10` | Ausgabenlimit in Dollar. |
| `--every 30d` | Budgetfenster: Es wird alle 30 Tage zurückgesetzt (`s m h d w mo`). |
| `--soft 8` | Schwellwert für den Soft-Alert. |
| `--models a,b` | Modelle, die der Key aufrufen darf (Standard: alle). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Rate Limits. |
| `--expires 30d` | Nach dieser Zeit funktioniert der Key nicht mehr. |
| `--user ID` / `--team ID` | Wem er gehört (und dessen Budget ebenfalls gilt). |

Schutzmechanismen bei jedem Admin-Befehl:

- **Erst die Vorschau.** `--dry-run` hört dort auf; `--yes` überspringt die Bestätigung; sonst fragt der native Dialog von Claude Code (**Apply** / **Cancel**).
- **Read-back.** Nach einem Grant liest das Plugin das Budget erneut vom Proxy und meldet, was dort *steht*, nicht was gesendet wurde.
- **Das neue Secret landet nie im Transkript.** Es geht in die Zwischenablage. Kann die Zwischenablage es nicht aufnehmen, wird der Key **wieder gelöscht** (Rollback), statt unlesbar zu bleiben. `--reveal` gibt es aus, mit dem Hinweis, dass es nun im Transkript gespeichert ist.
- **Rohe `sk-…`-Werte werden als Key-Referenz abgelehnt:** Nutze einen Alias oder den Key-Hash. Unbekannte Flags sind Fehler und werden nicht stillschweigend ignoriert.
- **Ehrliche Zahlen.** `grant` sagt Bescheid, wenn der Verbrauch das neue Budget bereits übersteigt, wenn es kein Limit gibt, auf das aufgeschlagen werden könnte (nutze `--set`), wenn sich nichts ändern würde und wenn `--user` einen User anlegen würde, den der Proxy noch nie gesehen hat.
- **Der Admin-Key** geht nur an den Proxy, der den eigenen Key deiner Session bereits akzeptiert hat, und wird nie ausgegeben (Fehler werden geschwärzt).

Was sich heute mit LiteLLM v1.99.1 als zusätzliches Budget vergeben *lässt*: das Budget eines **Keys**, eines **Users** oder eines **Teams** (`--team`, braucht einen Proxy-Admin) anheben, als Zuwachs oder als Absolutwert (`--set`). Eine *temporäre* Budgeterhöhung (`temp_budget_increase`) und Budgets pro Modell gibt es proxyseitig nur in der Enterprise-Version (siehe [Budgets](#budgets-what-litellm-can-and-cannot-do)); das Plugin bietet sie daher nicht an, statt sie vorzutäuschen.

<a id="budgets-what-litellm-can-and-cannot-do"></a>
## Budgets: Was LiteLLM kann und was nicht

Live gegen LiteLLM v1.99.1 geprüft (Open-Source-Proxy, ohne Lizenz):

| Budget | Funktioniert? | Wie |
| --- | --- | --- |
| Pro **Key** (Limit + Reset-Fenster) | ✅ | `/litellm key new --budget 10 --every 30d`; erhöhen mit `/litellm grant 5 --key NAME` |
| Pro **User** | ✅ | `/litellm grant 5 --user ID` (gilt für jeden Key, den der User besitzt) |
| Pro **Team** | ✅ | `/litellm grant 50 --team NAME` (braucht einen Proxy-Admin) |
| Mehrere Fenster auf einem Key (`budget_limits`, z. B. $5/Stunde + $50/Monat) | nur lesend | wird als `Window 1h`-Balken angezeigt, wenn der Proxy sie hat |
| Pro **Modell** auf einem Key (`model_max_budget`) | ⛔ Enterprise | der Proxy antwortet *„You must have an enterprise license to set model_max_budget“*, auch bei `/budget/new`. Hat dein Proxy die Lizenz, zeigt das Panel diese Balken (`Model gpt-4o`) |
| Temporäre Budgeterhöhung (`temp_budget_increase`) | ⛔ Enterprise | der Open-Source-Proxy akzeptiert das Feld und erzwingt es nie |

**Budget pro Modell ohne Lizenz:** Lege pro Modell einen Key mit eigenem Limit an, z. B.
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. Der Key kann nur dieses Modell aufrufen und stoppt bei $5.

## Konfiguration

Das Plugin liest dieselbe URL und denselben Key wie Claude Code, in dieser Reihenfolge (zuerst Prozessvariablen, dann der `env`-Block von `settings.json`):

| Was | Woher |
| --- | --- |
| URL | Option `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Key | Option `litellm_key`, der Header `x-litellm-api-key` in `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

Endet die URL auf eine Pass-through-Route (`/anthropic`, `/bedrock`, `/v1`…), probiert das Plugin zusätzlich die Proxy-Wurzel. Ein Key wird nur mit der URL verwendet, zu der er gehört: Umgebungs-Keys gehen nie an eine `litellm_url` auf einem anderen Host, und `LITELLM_PROXY_API_BASE` wird nur mit `LITELLM_PROXY_API_KEY` gepaart.

Alle Optionen sind optional (Claude Code meldet bei der Installation, sie seien „not set“; das ist harmlos). Ändere sie mit `/plugin configure litellm-key@cc-litellm` oder mit `claude plugin configure litellm-key@cc-litellm --values-stdin` und einem JSON-Objekt aus Strings.

| Option | Standard | Wofür |
| --- | --- | --- |
| `litellm_url` | leer | Ein Proxy an einer nicht standardmäßigen Stelle (Bedrock/Vertex über LiteLLM, URL mit Präfix). |
| `litellm_key` | leer | Ein expliziter Key. 🔒 im Credential Store gespeichert, nicht in `settings.json`. |
| `litellm_admin_key` | leer | Admin-Key für `keys`, `key new/block/unblock`, `grant`, `fallbacks`. 🔒 gleicher Speicher. Wird nie ausgegeben. |
| `refresh_seconds` | 60 | Leseintervall (15 bis 3600). Liest außerdem nach jedem Turn, höchstens alle 20 s. |
| `warn_percent` | 80 | Erste Budgetwarnung (warnt außerdem bei 95 % und 100 %). |
| `show_status_line` | `yes` | Die Zeile unter dem Prompt. |
| `show_related` | `yes` | `/user/info` und `/team/info` lesen: Auch diese Budgets können Requests blockieren. |
| `show_usage` | `yes` | `/user/daily/activity` (ein Beta-Endpunkt von LiteLLM) für die 7-Tage-Nutzung lesen. |
| `compact_pane` | `no` | Kompaktes Panel über dem Prompt in schmalen Terminals (74 bis 121 Spalten): ein Balken pro Zeile, Fakten nebeneinander. |

## Woher die Daten kommen

**Beobachten** liest nur (`GET`), immer mit deinem eigenen Key:

| Endpunkt | Wofür |
| --- | --- |
| `/key/info` | Alias, Verbrauch, Budget und Fenster, Reset, Limits, Ablauf, Status, Modelle, Budgets pro Modell. Bei jedem Lesen. |
| `/user/info`, `/team/info` | Budget des Users und des Teams des Keys, sofern begrenzt. Bei jedem Lesen. |
| `/v1/models` | Die tatsächlich erlaubten Modelle. Alle 10 Min. |
| `/user/daily/activity` | Verbrauch, Requests und Tokens der letzten 7 Tage. Alle 10 Min. |

**Verwalten** passiert nur, wenn du einen Admin-Befehl eingibst: `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/router/settings` und `POST /key/generate`, `/key/delete` (nur Rollback), `/key/block`, `/key/unblock`, `/key/update`, `/user/update`, `/team/update`.

Jede Anfrage wartet höchstens 4 s (15 s bei Admin-Befehlen). Ein optionaler Lesezugriff, der fehlschlägt (403, 404…), wird zu einer unaufdringlichen Notiz im Panel, nie zu einem Fehler. Fällt der Proxy aus, behält das Panel die letzte gute Messung und markiert sie als veraltet. LiteLLM schreibt den Verbrauch stapelweise in seine Datenbank, daher hinken die Zahlen einem Request um etwa 10 Sekunden hinterher.

## Datenschutz und Sicherheit

- Dein Key wandert nur zu dem Proxy, den Claude Code ohnehin nutzt, im Header `Authorization` (oder `x-litellm-api-key`). Nie in einer URL, einem Log, Toast, State oder im Speicher des Plugins; Fehlermeldungen laufen durch einen Filter, der ihn maskiert.
- Der Admin-Key wird nur an die Proxy-Wurzel gesendet, die deinen Session-Key bereits akzeptiert hat, und nur wenn du einen Admin-Befehl eingibst.
- Das Plugin speichert nur die IDs der bereits angezeigten Warnungen, um Wiederholungen zu vermeiden.
- `litellm-key` liest `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` und `LITELLM_PROXY_API_KEY`, den `env`-Block von `settings.json` und stellt HTTP-Requests. `claude plugin validate plugins/litellm-key` listet all das auf.

## Wenn etwas nicht angezeigt wird

| Symptom | Wahrscheinliche Ursache |
| --- | --- |
| Nichts in der Statuszeile, Toast sagt „not configured“ | Claude Code läuft nicht hinter einem Proxy (`ANTHROPIC_BASE_URL` fehlt oder zeigt auf `api.anthropic.com`). |
| „The proxy has no database record for this key“ | Es ist der Master-Key oder ein Key, der nur in `config.yaml` steht. Nur mit `/key/generate` erzeugte Keys haben Daten. |
| „The proxy has no database“ | Der Proxy läuft ohne `DATABASE_URL`: Es gibt keine virtuellen Keys zum Lesen. |
| „does not look like a LiteLLM proxy“ | Die URL zeigt auf etwas anderes. Setze `litellm_url` auf die Proxy-Wurzel. |
| „key blocked“ / „key expired“ | Genau das. Frag einen Admin oder führe `/litellm key unblock` aus einer anderen Session aus. |
| „key rejected (401)“ | Ungültiger Key. |
| Der 7-Tage-Verlauf fehlt | Der Key hat keine `user_id`, oder der Beta-Endpunkt fehlt in deiner LiteLLM-Version. |
| Ein Admin-Befehl meldet, er brauche einen Admin-Key | Setze `litellm_admin_key`. |
| Ein Admin-Befehl wartet „until the proxy accepts this session's key“ | Gewollt: Der Admin-Key geht nur an einen Proxy, der deinen eigenen Key akzeptiert hat. Repariere diesen Key aus einer anderen Session oder in der LiteLLM-UI. |

`/litellm debug` zeigt, was das Plugin aufgelöst hat.

## Mit einem echten LiteLLM auf dem Laptop ausprobieren

`dev/litellm` ist ein vollständiges Labor: LiteLLM v1.99.1 mit Postgres in Docker, damit virtuelle Keys, Budgets und Verbrauch echt sind.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (der Standard) bildet ein echtes „auto“-Setup nach: eine gewichtete `cloud/auto`-Gruppe, eine Fallback-Kette, einen Context-Window-Fallback und ein Modell (`demo/always-429`), das immer fehlschlägt, sodass der Router sichtbar auf den Fallback ausweicht. Nichts verlässt deinen Rechner.
- **Das Routing deines eigenen Clusters:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` liest (nur lesend, per `kubectl`) die `config.yaml` deines Proxys und **nur** die Provider-Variablen, auf die sie verweist, und schreibt eine lokale `config.cluster.yaml` + `.env` (git-ignoriert: niemals committen). Danach `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`** ist ein winziger Fake-Proxy für die UI-Zustände (`--scenario warning|blocked|…`), ohne Docker.
- **`dev/evidence/`** ist das Harness, das jeden Screenshot in dieser README aufgenommen hat: ein echtes Claude Code in einer ConPTY, als PNG gerendert. Siehe [`dev/evidence/README.md`](../../dev/evidence/README.md).

## Entwicklung

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Aufbau des Plugins: `hooks/register.tsx` ist die einzige Datei, die das `$` von Claude Code anfasst; sie baut die injizierten Ports (`hooks/ports.ts`) und verdrahtet Events, Befehle, Timer und Toasts. Alles andere sind reine Funktionen, die diese Ports entgegennehmen und deshalb im Test laufen, ohne die Engine zu starten. `hooks/session.ts` ist der Lesezyklus (Konfiguration, Ticker, vorgemerktes erzwungenes Aktualisieren); `hooks/credentials.ts` und `hooks/settings.ts` lösen den Key und die Optionen auf; `hooks/litellm.ts` liest den Proxy, `hooks/parsers.ts` und `hooks/json.ts` normalisieren die Antworten und `hooks/failures.ts` benennt, was schiefgelaufen ist; `hooks/alerts.ts` entscheidet über die Toasts. `hooks/commands.ts` ist die Befehlstabelle von `/litellm` und `hooks/admin*.ts` die Admin-Befehle (`admin.ts` die Lesezugriffe auf den Proxy, `admin-targets.ts` die Suchen nach Key, User und Team, `admin-writes.ts` seine Schreibzugriffe, `admin-plan.ts` die Vorschauen und Pläne, `admin-link.ts` die Verbindung des Admin-Keys zum Proxy, `admin-commands.ts` der Ablauf, `args.ts` der Argument-Parser). `hooks/exceeded.ts` und `hooks/band.tsx` sind das Banner bei Budgetüberschreitung; `hooks/summary.ts` baut den Text, `hooks/view.tsx` und `hooks/parts.tsx` das Panel (Gauge, Abschnittstitel, Status-Chip, Balkenzeilen); `hooks/format.ts` enthält die reinen Formatierer; `types/index.d.ts` ist der State-Vertrag.

## Bekannte Grenzen

- `apiKeyHelper` wird nicht gelesen (einen Benutzerbefehl auszuführen liegt außerhalb des Umfangs). Nutze `litellm_key`.
- `/user/daily/activity` ist in LiteLLM Beta und kann sich ändern.
- Budgets pro Modell (`model_max_budget`), temporäre Budgeterhöhungen und das Neugenerieren von Keys gibt es proxyseitig nur in der Enterprise-Version und werden daher nicht angeboten (siehe [Budgets](#budgets-what-litellm-can-and-cannot-do)).
- Das Banner bei Budgetüberschreitung wird auf Terminal- und Desktop-Oberflächen gezeichnet (nur dort bietet Claude Code das Band an); auf anderen sagen es Statuszeile und Panel.
- Das `⚠` vor der Statuszeile zeichnet Claude Code bei jedem Statuseintrag eines Plugins; es bedeutet nicht, dass der Key in Schwierigkeiten ist (das sagt der Text).
- Die Plugin-API von Claude Code ist Early Access und kann sich zwischen Versionen ändern.

## Lizenz

[MIT](../../LICENSE).

## Weitere Sprachen

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
