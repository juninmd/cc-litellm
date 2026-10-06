<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm: tu clave de LiteLLM, tu presupuesto y tus fallbacks dentro de Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Plugin de Claude Code" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 y v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="Versión 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.pt-BR.md">Português</a> ·
  <b>Español</b> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> Esta es una traducción del README en inglés. Si hay diferencias, la versión en inglés ([README.md](../../README.md)) es la de referencia.

# cc-litellm

Un plugin de [Claude Code](https://code.claude.com) para quienes acceden a sus modelos a través de un **proxy [LiteLLM](https://docs.litellm.ai)**. Muestra lo que el proxy sabe de la **clave virtual** que usa Claude Code (presupuesto, gasto, límites, vencimiento, modelos, uso de los últimos 30 días) y, para administradores, permite **crear y editar claves, dar presupuesto extra a alguien, bloquear una clave y leer las cadenas de fallback del router** sin salir de la terminal.

Este repositorio es un marketplace de plugins (`cc-litellm`) con un único plugin: [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="El panel /litellm junto a la conversación, frente a un proxy LiteLLM real" width="92%">
</p>

## Qué obtienes

| | | |
| --- | --- | --- |
| 👀 **Supervisar** | **Línea de estado** bajo el prompt, siempre visible | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **Panel `/litellm`** | medidores de los presupuestos de la clave, el equipo, el usuario y el **miembro del equipo**, el **rol** del usuario, límites, vencimiento, modelos, sparkline de 7 días, los **modelos con más gasto** de la semana y un pronóstico de **runway**; se actualiza solo |
| | **Pestañas del panel** | **Usage** (gasto, solicitudes o tokens por día en barras, a 7, 14 o 30 días, un día para elegir, cómo se movió cada modelo), **Models** (lo que gastó cada uno, un filtro, un orden), **Details** (los campos de la clave, la versión y la base de datos de LiteLLM, la latencia) |
| | **Orientación** | **Allowance** (cuánto gastar por día para durar hasta el reinicio), **Headroom** (cuántas solicitudes más caben en el tope), **Today** frente al día habitual, **Session** (lo que gastó esta sesión de Claude Code, y a qué ritmo) |
| | **Notificaciones (toasts)** | al 80% (configurable), 95% y 100%; clave a punto de vencer; clave bloqueada o vencida; el gasto de hoy por encima de tu **alerta diaria**. Una vez por ventana de presupuesto, incluso entre sesiones |
| | **Banner de presupuesto excedido** | una banda roja sobre el prompt que **permanece mientras algún presupuesto esté agotado** (clave, usuario, equipo, ventana o modelo) y desaparece solo cuando las cifras vuelven a la normalidad |
| 📊 **Informar** | **`/litellm pace`**, `usage`, `compare`, `day`, `status` | hacia dónde va el presupuesto, los días y los modelos en tablas, qué cambió frente a los días anteriores, un día por modelo |
| | **`/litellm check`** | `OK`, `WARNING`, `CRITICAL` o `UNKNOWN` **y el código de salida de una ejecución `claude -p`** (0 a 3), para scripts y monitoreo |
| | **`/litellm json`** / `csv` | todo en JSON, los días en CSV; **`copy`** pone cualquier informe en el portapapeles, **`share`** se lo entrega a Claude para preguntarle sobre él |
| 🛠️ **Gestionar** *(admin)* | **`/litellm key new`** | crea una clave virtual; el secreto va a tu **portapapeles, nunca a la transcripción** |
| | **`/litellm grant`** | presupuesto extra para una clave, un usuario, un equipo o una organización, con vista previa y confirmación |
| | **`/litellm key set`** / `reset-spend` | cambia los modelos, límites, vencimiento o alias de una clave; pone a cero su contador de gasto |
| | **`/litellm key block`** / `unblock` | detiene (o restablece) una clave en una sola línea |
| | **`/litellm org`** | el presupuesto de una organización, que una clave virtual no puede leer |
| | **`/litellm keys`** | lista claves: las tuyas, las de un usuario, las de un equipo o todas |
| | **`/litellm fallbacks`** | las cadenas de fallback del router (`cloud/auto → cloud/auto-long → …`), más los fallbacks por ventana de contexto |

Cada cambio muestra primero una **vista previa**, pide confirmación en el **diálogo nativo** de Claude Code, se aplica y luego **relee el resultado** desde el proxy.

<a id="install"></a>

## Instalación

Requiere una versión reciente de Claude Code: el plugin usa function hooks (una API de acceso anticipado) y está probado en la 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Pruébalo desde un clon, sin instalar: `claude --plugin-dir ./plugins/litellm-key`.

Si Claude Code ya se comunica con LiteLLM, **no hay nada que configurar**: el plugin lee la misma URL y la misma clave que usa Claude Code. Los comandos de administración además requieren `litellm_admin_key` (consulta [Comandos de administración](#admin-commands)).

## Un recorrido

### Vigila el presupuesto

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code con la línea de estado de litellm-key bajo el prompt" width="92%">
</p>

`/litellm models` lista lo que la clave puede invocar y `/litellm keys`, las claves que posees:

<p align="center">
  <img src="../evidence/keys.png" alt="Salida de /litellm models y /litellm keys" width="92%">
</p>

### Mira de cerca: uso, modelos, detalles

El panel tiene cuatro pestañas. Overview es el panel de arriba; **Usage** dibuja los últimos 7, 14 o 30 días en barras, contando gasto, solicitudes o tokens, te deja elegir un día para ver sus modelos y dice qué modelo se movió frente a los días anteriores:

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

**Models** lista lo que la clave puede invocar con lo que gastó cada modelo en el período (ordena por gasto o por nombre, y escribe en el filtro para acotar una lista larga); **Details** agrupa lo que el proxy dijo de la clave, la versión y el estado de la base de datos de LiteLLM, y cuánto tardó `/key/info`. El período, el orden y el gráfico que eliges se guardan para la próxima vez, y `/litellm` abre el panel en la pestaña en que lo dejaste.

### Pide un informe, o entrégaselo a un script

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

### Detecta los problemas a tiempo y llámalos por su nombre

El plugin distingue una clave bloqueada de una vencida y de una incorrecta, en lugar de mostrar un *401* genérico:

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="86% del presupuesto consumido"><br><sub><b>86%</b>: toast de advertencia y línea de estado</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="Presupuesto excedido"><br><sub><b>Presupuesto excedido</b>: un banner que permanece hasta que el presupuesto vuelve a la normalidad</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="Clave bloqueada"><br><sub>Clave <b>bloqueada</b>, identificada como bloqueada</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="Clave vencida"><br><sub>Clave <b>vencida</b>, identificada como vencida</sub></td>
  </tr>
</table>

### Genera una clave

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="Confirmación nativa antes de crear una clave"><br><sub>Vista previa y, después, la confirmación nativa de Claude Code</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="La clave se copió al portapapeles"><br><sub>El secreto va al portapapeles. La transcripción solo ve <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### Da presupuesto extra

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="Vista previa de una ampliación de presupuesto"><br><sub><code>$25 → $35 (+$10)</code>, lo gastado y lo que quedaría</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="La clave vuelve a tener margen tras la ampliación"><br><sub>Aplicado y releído; la línea de estado lo refleja (101% → 79%)</sub></td>
  </tr>
</table>

### Cuando el equipo limita a cada miembro

Un equipo puede limitar lo que gasta cada miembro (`team_member_budget`). El proxy rechaza la petición con el presupuesto propio de la clave en orden, así que el plugin lee el tope y lo muestra como un medidor `Member`, y el banner de presupuesto excedido lo nombra:

<p align="center">
  <img src="../evidence/member-cap.png" alt="El panel con un medidor Member por encima de su tope, el banner sobre el prompt y la organización de la clave con nombre" width="92%">
</p>

<sub>Captura contra `dev/mock-litellm.py --scenario member`. El proxy no informa a una clave virtual del total de un miembro, así que el medidor cuenta <b>el gasto de esta clave</b> y lo dice. Puede marcar de menos y, frente a un tope que se reinicia, puede marcar de más (un reinicio pone a cero el gasto del miembro, no el de la clave), así que el banner solo se activa para un tope que nunca se reinicia. También se nombra la organización de la clave; su presupuesto es solo de admin, <code>/litellm org</code> lo lee.</sub>

### Lee las cadenas de fallback

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Conoce lo que cuesta un modelo

<p align="center">
  <img src="../evidence/models-prices.png" alt="/litellm models con el precio por millón de tokens de entrada y de salida y la ventana de contexto" width="92%">
</p>

### Y el proxy coincide

Todo lo anterior es la interfaz de administración real de LiteLLM v1.99.1 reflejando lo que hizo el plugin:

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="UI de LiteLLM, Virtual Keys"><br><sub>Claves creadas y ampliadas desde Claude Code; una de ellas vencida</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="UI de LiteLLM, Usage"><br><sub>El gasto aparece en Usage</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="UI de LiteLLM, Internal Users"><br><sub>El rol del usuario en el proxy (<code>internal_user</code>, <code>proxy_admin</code>) es lo que muestra la línea <b>Role</b> del panel</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Comandos

| Comando | Qué hace |
| --- | --- |
| `/litellm` | Abre el panel, en la pestaña en que lo dejaste (y responde con un resumen de una línea). Sin pantalla: imprime esa pestaña como texto. |
| `/litellm tab <name>` | Abre el panel en `overview`, `usage`, `models` o `details` (o 1 a 4). |
| `/litellm refresh` | Vuelve a leer ahora. |
| `/litellm info` | Imprime el resumen completo en la transcripción. |
| `/litellm status` | Imprime la línea de estado como texto. |
| `/litellm pace` | Hacia dónde va el presupuesto, cuánto puede gastar por día para durar, y lo mismo para el equipo y el usuario. |
| `/litellm usage [7\|14\|30]` | El gasto, las solicitudes y los tokens por día en una tabla, con los totales y los modelos. |
| `/litellm compare [7\|14]` | Los últimos días completos frente al mismo número de días anteriores, en conjunto y modelo por modelo. |
| `/litellm day [when]` | Un día por modelo: `today`, `yesterday`, `2026-10-03`, `10-03` o un día de la semana (`mon`). |
| `/litellm models [text]` | Lista los modelos que esta clave puede invocar, con su precio por millón de tokens y su ventana de contexto; con un texto, solo los que lo tienen en el nombre. |
| `/litellm check [warn%]` | `OK`, `WARNING`, `CRITICAL` o `UNKNOWN`, y el código de salida de una ejecución `claude -p`: 0, 1, 2, 3. Un presupuesto por encima de su tope, o una clave que el proxy dice que está bloqueada, vencida o rechazada, es `CRITICAL`; un proxy que no responde es `UNKNOWN`. |
| `/litellm json` | Todo lo que el plugin sabe de la clave en JSON (sin la clave, sin el hash). |
| `/litellm csv [7\|14\|30]` | Los días en CSV. |
| `/litellm copy [what]` | Pone un informe en el portapapeles: `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` o `json`. |
| `/litellm share [what]` | Entrega un informe a Claude, fuera de la vista, para que la siguiente pregunta sea sobre él. |
| `/litellm ping` | Prueba cada endpoint que lee el plugin, con su estado y su tiempo. |
| `/litellm debug` | Muestra de dónde salen la URL y las claves (siempre enmascaradas), qué se intentó y el resultado. |
| `/litellm close` | Cierra el panel. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Lista claves. Por defecto: las claves de tu propio usuario. 🔐 |
| `/litellm key new <alias> [flags]` | Crea una clave. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Bloquea o restablece una clave. 🔐 |
| `/litellm key set <alias\|hash> [flags]` | Cambia los modelos, límites, vencimiento o alias de una clave. 🔐 |
| `/litellm key reset-spend <alias\|hash>` | Devuelve a cero el contador de gasto de una clave. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | Suma presupuesto. 🔐 |
| `/litellm org [id\|alias]` | El presupuesto de una organización; sin nombre: la organización de la propia clave y, si no, la lista. 🔐 |
| `/litellm fallbacks [model]` | Cadenas de fallback del router, opcionalmente solo para los modelos que coincidan con un nombre. 🔐 |

🔐 = comando de administración, ver más abajo. En el panel (dale el foco con un clic o con `ctrl+x` `tab`): `1` a `4` cambian de pestaña, `r` actualiza, `c` copia la pestaña en que estás, `q` cierra y las flechas desplazan; cada botón indica su tecla (`Refresh (r)`, `Copy (c)`, `Close (q)`). En Usage, `d` recorre 7, 14 y 30 días, `m` gasto, solicitudes y tokens, `v` copia los días en CSV; en Models, `s` ordena y `f` va al filtro. `Esc` también cierra el panel cuando el prompt está vacío (en Models solo sale del filtro).

Un comando mal escrito recibe una sugerencia (`Did you mean "usage"?`). Un comando que no puede hacer lo que se le pidió lo dice en una frase, y los pensados para scripts (`check`, `json`, `csv`, `ping`) terminan con el código de salida 3 cuando no hay nada que informar.

El panel se adapta al espacio: junto a la conversación (pantalla completa, desde 110 columnas) cada medidor ocupa dos líneas; sobre el prompt, desde 122 columnas, los medidores pasan a ser una tabla; en terminales más estrechas mantiene dos líneas por medidor o se vuelve **compacto** si activas `compact_pane`. Junto a la conversación, el panel muestra secciones con título (`BUDGETS`, `KEY`, `LAST 7 DAYS`, `TOP MODELS`) y una letra bajo cada día de la semana; `TOP MODELS` ordena los cinco modelos que más gastaron, cada uno con su parte de la semana como una barra. Un nombre largo se corta por el medio, para que `claude-sonnet-4-5` y `claude-sonnet-4-6` sigan distinguiéndose. El color nunca es la única señal: `▲` marca un presupuesto cercano a su tope, `✖` uno que ya está agotado, y un día sin gasto es un `·`, nunca una barra corta.

**Runway.** La fila `Runway` (en el panel y en `/litellm info`) compara el ritmo de los últimos 7 días (menos días en una clave más reciente, nunca menos de uno) con el tope: `lasts until the reset at $2.18/day`, o `out in 2d 6h at $2.18/day · resets in 6d 12h` cuando el presupuesto se agotaría antes. La línea de estado añade `out in 2d 6h at this pace` solo cuando eso se avecina: antes del reinicio, o dentro de 3 días en una clave sin reinicio. Una clave sin tope, una ya agotada y una cuyo reinicio ya venció no reciben pronóstico.

<p align="center">
  <img src="../evidence/runway.png" alt="El panel de una clave en camino de agotarse: la fila Runway y la línea de estado avisan, y la semana se reparte por modelo" width="92%">
</p>

<sub>Captura contra `dev/mock-litellm.py --scenario warning`: el laboratorio local no tiene una semana de historial sobre la que pronosticar.</sub>

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help" width="92%">
</p>

<a id="admin-commands"></a>

## Comandos de administración

Leer y modificar claves requiere ser administrador del proxy. Define la opción **`litellm_admin_key`** (se guarda en el almacén de credenciales de tu sistema operativo, nunca en `settings.json`). Sin ella, el plugin lo intenta con tu clave virtual y, si el proxy lo rechaza, te lo dice con exactitud.

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
| `--budget 10` | Tope de gasto en dólares. |
| `--every 30d` | Ventana de presupuesto: se reinicia cada 30 días (`s m h d w mo`). |
| `--soft 8` | Umbral de alerta suave. |
| `--models a,b` | Modelos que la clave puede invocar (por defecto, todos). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Límites de tasa. |
| `--expires 30d` | La clave deja de funcionar pasado este tiempo. |
| `--user ID` / `--team ID` | Quién la posee (y cuyo presupuesto también se aplica). |

| Flag de `key set` | Significado |
| --- | --- |
| `--models a,b` / `--models all` | Sustituye los modelos que la clave puede invocar (`all`: todos los modelos). |
| `--rpm N` / `--tpm N` / `--parallel N` | Fija un límite; `none` lo elimina. |
| `--expires 30d` / `--expires never` | Vence pasado este tiempo desde ahora, o nunca. |
| `--alias NEW` | Renombra la clave. |

Un campo que omites se queda como está. La vista previa muestra `before → after` para cada campo y avisa cuando la clave es la que usa Claude Code.

Salvaguardas en cada comando de administración:

- **Primero, la vista previa.** `--dry-run` se detiene ahí; `--yes` omite la confirmación; de lo contrario, el diálogo nativo de Claude Code pregunta (**Apply** / **Cancel**).
- **Relectura.** Tras un `grant`, el plugin vuelve a leer el presupuesto desde el proxy e informa de lo que *hay* allí, no de lo que envió.
- **El secreto nuevo nunca llega a la transcripción.** Va al portapapeles. Si el portapapeles no puede recibirlo, la clave se **vuelve a eliminar** (rollback) en lugar de quedar guardada e ilegible. `--reveal` lo imprime, con una advertencia de que ahora queda guardado en la transcripción.
- **Se rechazan los valores `sk-…` en bruto** como referencia a una clave: usa un alias o el hash de la clave. Los flags desconocidos son errores, no se ignoran en silencio.
- **Cifras honestas.** `grant` avisa cuando el gasto ya supera el nuevo presupuesto, cuando no hay un tope al que sumar (usa `--set`), cuando no cambiaría nada y cuando `--user` crearía un usuario que el proxy nunca ha visto.
- **La clave de administración** se envía solo al proxy que ya aceptó la propia clave de tu sesión, y nunca se imprime (los errores se enmascaran).

Lo que *sí* se puede dar hoy como presupuesto extra, en LiteLLM v1.99.1 y v1.104.0: subir el presupuesto de una **clave**, de un **usuario** o de un **equipo** (`--team`, que requiere ser administrador del proxy), como incremento o como valor absoluto (`--set`). Un presupuesto de **organización** (`--org`) funciona hasta la v1.101; desde la v1.102 el proxy reserva las organizaciones a las licencias enterprise y el plugin lo indica. Un aumento *temporal* de presupuesto (`temp_budget_increase`) y los presupuestos por modelo son exclusivos de la edición enterprise en el lado del proxy (ver [Presupuestos](#budgets-what-litellm-can-and-cannot-do)), así que el plugin no los ofrece en lugar de fingir que existen.

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## Presupuestos: qué puede y qué no puede hacer LiteLLM

Verificado en vivo contra LiteLLM v1.99.1 (proxy de código abierto, sin licencia); el tope por miembro y las organizaciones también se verificaron en la v1.104.0:

| Presupuesto | ¿Funciona? | Cómo |
| --- | --- | --- |
| Por **clave** (tope + ventana de reinicio) | ✅ | `/litellm key new --budget 10 --every 30d`; súbelo con `/litellm grant 5 --key NAME` |
| Por **usuario** | ✅ | `/litellm grant 5 --user ID` (se aplica a todas las claves que posee el usuario) |
| Por **equipo** | ✅ | `/litellm grant 50 --team NAME` (requiere ser administrador del proxy) |
| Por **miembro** de un equipo (`team_member_budget`) | 👀 solo lectura | bloquea las solicitudes del usuario en ese equipo (HTTP 429, 422 desde la v1.104). El panel muestra el tope como `Member…`; defínelo en la interfaz o en la API de LiteLLM. Una clave virtual no puede leer el total del miembro, así que el medidor cuenta el **gasto de esta clave** y lo dice. Un reinicio pone a cero el gasto del miembro, pero no el de la clave, así que el banner de presupuesto excedido solo se activa para un tope que nunca se reinicia; frente a un tope que se reinicia el medidor avisa, no afirma un bloqueo |
| Por **organización** | ✅ hasta la v1.101 · ⛔ enterprise desde la v1.102 | bloquea todas las claves que contiene (HTTP 429). Una clave virtual no puede leerlo: el panel nombra la organización, `/litellm org` muestra el presupuesto (admin), `grant --org` lo sube |
| Varias ventanas en una misma clave (`budget_limits`, p. ej., $5/hora + $50/mes) | solo lectura | se muestran como medidores `Window 1h` cuando el proxy las tiene |
| Por **modelo** en una clave (`model_max_budget`) | ⛔ enterprise | el proxy responde *"You must have an enterprise license to set model_max_budget"*, también para `/budget/new`. Si tu proxy tiene la licencia, el panel muestra esos medidores (`Model gpt-4o`) |
| Aumento temporal de presupuesto (`temp_budget_increase`) | ⛔ enterprise | el proxy de código abierto acepta el campo pero nunca lo aplica |

**Presupuesto por modelo sin la licencia:** crea una clave por modelo, cada una con su propio tope, p. ej.
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. La clave solo puede invocar ese modelo y se detiene en $5.

## Configuración

El plugin lee la misma URL y la misma clave que usa Claude Code, en este orden (primero las variables del proceso y luego el bloque `env` de `settings.json`):

| Qué | Origen |
| --- | --- |
| URL | opción `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Clave | opción `litellm_key`, el encabezado `x-litellm-api-key` de `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

Si la URL termina en una ruta de pass-through (`/anthropic`, `/bedrock`, `/v1`…), el plugin prueba también la raíz del proxy. Una clave solo se usa con la URL a la que pertenece: las claves del entorno nunca se envían a un `litellm_url` de otro host, y `LITELLM_PROXY_API_BASE` solo se empareja con `LITELLM_PROXY_API_KEY`.

Todas las opciones son opcionales (Claude Code avisa al instalar que están "not set"; es inofensivo). Cámbialas con `/plugin configure litellm-key@cc-litellm`, o con `claude plugin configure litellm-key@cc-litellm --values-stdin` pasando un objeto JSON de cadenas de texto.

| Opción | Valor por defecto | Para |
| --- | --- | --- |
| `litellm_url` | vacío | Un proxy en una ubicación no predeterminada (Bedrock/Vertex a través de LiteLLM, URL con prefijo). |
| `litellm_key` | vacío | Una clave explícita. 🔒 se guarda en el almacén de credenciales, no en `settings.json`. |
| `litellm_admin_key` | vacío | Clave de administración para `keys`, `key new/set/reset-spend/block/unblock`, `grant`, `org`, `fallbacks`. 🔒 mismo almacenamiento. Nunca se imprime. |
| `refresh_seconds` | 60 | Intervalo de lectura (de 15 a 3600). También lee después de cada turno, como máximo cada 20 s. |
| `warn_percent` | 80 | Primera advertencia de presupuesto (también avisa al 95% y al 100%). |
| `daily_alert` | 0 (desactivada) | Avisa cuando el gasto de hoy de la clave llega a esa cantidad de dólares: un toast por día, la línea de estado y el panel. Con ella activa, el historial de uso se lee cada 3 minutos. |
| `show_toasts` | sí | Los toasts que avisan del presupuesto, de la alerta diaria, de una clave que va a vencer y de un proxy que falla. Desactivados, los avisos quedan en la línea de estado y en el panel. |
| `show_status_line` | sí | La línea bajo el prompt. |
| `show_related` | sí | Lee `/user/info` y `/team/info`: esos presupuestos también pueden bloquear solicitudes. |
| `show_usage` | sí | Lee `/user/daily/activity` (un endpoint beta de LiteLLM): los últimos 30 días de uso, en los que se apoyan las pestañas Usage y Models, los informes, el runway y la alerta diaria. |
| `compact_pane` | no | Panel compacto sobre el prompt en terminales estrechas (de 74 a 121 columnas): un medidor por línea, datos lado a lado. |

## De dónde salen los datos

**Supervisar** solo lee (`GET`), siempre con tu propia clave:

| Endpoint | Para |
| --- | --- |
| `/key/info` | Alias, gasto, presupuesto y ventanas, reinicio, límites, vencimiento, estado, modelos, presupuestos por modelo. En cada lectura. |
| `/user/info`, `/team/info` | Presupuesto del usuario y del equipo de la clave, y el tope por miembro del equipo, cuando tienen tope. En cada lectura. |
| `/v1/models` | Los modelos realmente permitidos. Cada 10 min. |
| `/model_group/info` | Precio por token y ventana de contexto de esos modelos (el proxy responde por todos sus modelos; el plugin se queda con los permitidos). Cada 10 min. |
| `/user/daily/activity` | Gasto, solicitudes, tokens y modelos de los últimos 30 días, día por día. Cada 10 min. |
| `/health/readiness` | La versión de LiteLLM y si su base de datos está conectada. Cada 10 min; cuando el proxy no lo dice, no se muestra nada, ni siquiera una nota. |

Las lecturas marcadas como cada 10 min ocurren cada 3 minutos mientras haya un `daily_alert`: el gasto de hoy es lo que vigila.

**Gestionar** solo ocurre cuando escribes un comando de administración: `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/organization/info`, `/organization/list`, `/router/settings`, y `POST /key/generate`, `/key/delete` (solo para rollback), `/key/block`, `/key/unblock`, `/key/update`, `/key/{hash}/reset_spend`, `/user/update`, `/team/update`, `PATCH /organization/update`.

Cada solicitud espera como máximo 4 s (15 s en los comandos de administración). Una lectura opcional que falla (403, 404…) se convierte en una nota discreta en el panel, nunca en un error. Si el proxy se cae, el panel conserva la última lectura válida, marcada como desactualizada. LiteLLM escribe el gasto en su base de datos por lotes, por lo que las cifras se retrasan unos 10 segundos respecto de la solicitud.

## Privacidad y seguridad

- Tu clave solo viaja al proxy que Claude Code ya usa, en el encabezado `Authorization` (o `x-litellm-api-key`). Nunca aparece en una URL, un log, un toast, el estado ni el almacenamiento del plugin; los mensajes de error pasan por un filtro que la enmascara.
- La clave de administración solo se envía a la raíz del proxy que ya aceptó la clave de tu sesión, y únicamente cuando escribes un comando de administración.
- El plugin guarda únicamente los ids de las advertencias que ya mostró, para no repetirlas.
- `litellm-key` lee `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` y `LITELLM_PROXY_API_KEY`, el bloque `env` de `settings.json`, y realiza solicitudes HTTP. `claude plugin validate plugins/litellm-key` lo enumera todo.

## Si algo no aparece

| Síntoma | Causa probable |
| --- | --- |
| No aparece nada en la línea de estado y el toast dice "not configured" | Claude Code no está detrás de un proxy (falta `ANTHROPIC_BASE_URL` o apunta a `api.anthropic.com`). |
| "The proxy has no database record for this key" | Es la clave maestra o una clave definida solo en `config.yaml`. Solo las claves creadas con `/key/generate` tienen datos. |
| "The proxy has no database" | El proxy se ejecuta sin `DATABASE_URL`: no hay claves virtuales que leer. |
| "does not look like a LiteLLM proxy" | La URL apunta a otra cosa. Define `litellm_url` con la raíz del proxy. |
| "key blocked" / "key expired" | Exactamente eso. Pide ayuda a un administrador o ejecuta `/litellm key unblock` desde otra sesión. |
| "key rejected (401)" | Clave no válida. |
| Falta el historial de uso | La clave no tiene `user_id`, o el endpoint beta no existe en tu versión de LiteLLM. |
| Un comando de administración dice que necesita una clave de administración | Define `litellm_admin_key`. |
| Un comando de administración espera "until the proxy accepts this session's key" | Por diseño, la clave de administración solo se envía a un proxy que aceptó tu propia clave. Corrige esa clave desde otra sesión o desde la UI de LiteLLM. |

`/litellm debug` muestra lo que resolvió el plugin.

## Pruébalo con un LiteLLM real en tu máquina

`dev/litellm` es un laboratorio completo: LiteLLM v1.104.0 con Postgres 18 en Docker, de modo que las claves virtuales, los presupuestos y el gasto son reales. El CI lo levanta y ejecuta el smoke test en cada cambio.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (el predeterminado) replica una configuración "auto" real: un grupo `cloud/auto` ponderado, una cadena de fallback, un fallback por ventana de contexto y un modelo (`demo/always-429`) que siempre falla para que el router haga fallback de forma visible. Nada sale de tu máquina.
- **El enrutamiento de tu propio clúster:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` lee (solo lectura, `kubectl`) el `config.yaml` de tu proxy y **únicamente** las variables de proveedor que este referencia, y escribe un `config.cluster.yaml` + `.env` locales (ignorados por git: nunca los subas al repositorio). Después, `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`** es un proxy falso minúsculo para los estados de la UI (`--scenario warning|blocked|…`), sin Docker.
- **`dev/evidence/`** es el arnés que tomó cada captura de pantalla de este README: un Claude Code real en un ConPTY, renderizado a PNG. Consulta [`dev/evidence/README.md`](../../dev/evidence/README.md).

## Desarrollo

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Estructura del plugin: `hooks/register.tsx` es el único archivo que toca el `$` de Claude Code; construye los puertos inyectados (`hooks/ports.ts`) y conecta eventos, comandos, temporizadores y toasts. Todo lo demás son funciones simples que reciben esos puertos, así que se ejecutan en los tests sin arrancar el motor. `hooks/session.ts` es el ciclo de lectura (configuración, ticker, actualización forzada en cola); `hooks/credentials.ts` y `hooks/settings.ts` resuelven la clave y las opciones; `hooks/litellm.ts` lee el proxy, `hooks/parsers.ts` y `hooks/json.ts` normalizan las respuestas y `hooks/failures.ts` nombra lo que salió mal; `hooks/alerts.ts` decide los toasts. `hooks/commands.ts` es la tabla de comandos de `/litellm` y `hooks/admin*.ts` los comandos de administración (`admin.ts` las lecturas del proxy, `admin-targets.ts` las búsquedas de clave, usuario y equipo, `admin-writes.ts` sus escrituras, `admin-plan.ts` las vistas previas y los planes, `admin-link.ts` el vínculo de la clave de admin con el proxy, `admin-commands.ts` el flujo, `args.ts` el parser de argumentos). `hooks/exceeded.ts` y `hooks/band.tsx` son el banner de presupuesto excedido; `hooks/summary.ts` construye el texto, `hooks/view.tsx` y `hooks/parts.tsx` el panel (indicador, títulos de sección, chip de estado, filas de medidor); `hooks/format.ts` contiene los formateadores puros; `types/index.d.ts` es el contrato del estado. Las pestañas son `hooks/tab-*.tsx` (`tab-overview.tsx` es el panel que había antes de las pestañas, `parts-tabs.tsx` las partes que comparten, `chart.ts` las barras); los informes son `hooks/report-*.ts`, `details.ts` y `probe.ts` (`/litellm ping`), sobre `history.ts` (los 30 días, totales y comparaciones) y `guidance.ts` (allowance, headroom, today y la sesión). `hooks/commands-reports.ts` y `commands-share.ts` son los comandos que imprimen o entregan un informe.

## Límites conocidos

- `apiKeyHelper` no se lee (ejecutar un comando del usuario queda fuera del alcance). Usa `litellm_key`.
- `/user/daily/activity` es beta en LiteLLM y puede cambiar.
- Los presupuestos por modelo (`model_max_budget`), los aumentos temporales de presupuesto y la regeneración de claves son exclusivos de la edición enterprise en el lado del proxy, por lo que no se ofrecen (ver [Presupuestos](#budgets-what-litellm-can-and-cannot-do)). Editar las cadenas de fallback requiere `STORE_MODEL_IN_DB=True` en el proxy, así que `/litellm fallbacks` sigue siendo de solo lectura.
- El presupuesto de una **organización** no viene en la respuesta de la propia clave y una clave virtual puede no poder leerlo, así que el panel solo nombra la organización; `/litellm org` lo lee con una clave de administración. La clave de administración se sigue enviando solo cuando escribes un comando de administración, nunca con el temporizador de actualización.
- El total de un **miembro** del equipo no se informa a una clave virtual: el medidor `Member` cuenta solo el gasto de esta clave, así que puede marcar de menos: si el usuario tiene varias claves en el equipo, el proxy puede bloquear antes de lo que indica el medidor. Frente a un tope que se reinicia también puede marcar de más (un reinicio pone a cero el gasto del miembro, no el de la clave), así que ahí avisa y el banner se mantiene en silencio.
- El historial de uso lee una página de las filas de actividad del proxy; cuando hay más, el panel indica que es parcial. Los días son UTC, como los cuenta el proxy; el de hoy sigue en curso, así que las comparaciones lo dejan fuera.
- La fila **Session** cuenta cuánto creció el gasto de la clave desde la primera lectura de esta sesión de Claude Code. No distingue el gasto de esta sesión del de otra sesión con la misma clave.
- El banner de presupuesto excedido se dibuja en las superficies de terminal y de escritorio (Claude Code solo ofrece la banda ahí); en las demás, lo indican la línea de estado y el panel.
- El `⚠` que precede a la línea de estado lo dibuja Claude Code en cada entrada de estado de un plugin; no significa que la clave tenga problemas (eso lo dice el texto).
- La API de plugins de Claude Code es de acceso anticipado y puede cambiar entre versiones.

## Licencia

[MIT](../../LICENSE).

## Otros idiomas

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · **Español** · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
