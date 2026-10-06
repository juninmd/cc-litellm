<p align="center">
  <img src="../assets/banner.svg" alt="cc-litellm: LiteLLM anahtarınız, bütçeniz ve fallback'leriniz Claude Code içinde" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude Code eklentisi" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 ve v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="Sürüm 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.pt-BR.md">Português</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.it.md">Italiano</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.ru.md">Русский</a> ·
  <b>Türkçe</b> ·
  <a href="README.hi.md">हिन्दी</a>
</p>

> Bu belge, [İngilizce README](../../README.md)'nin çevirisidir. İki sürüm arasında fark olursa referans İngilizce sürümdür.

# cc-litellm

Modellerine bir **[LiteLLM](https://docs.litellm.ai) proxy'si** üzerinden erişenler için bir [Claude Code](https://code.claude.com) eklentisi. Claude Code'un kullandığı **sanal anahtar** hakkında proxy'nin bildiklerini (bütçe, harcama, limitler, son kullanma tarihi, modeller, 30 günlük kullanım) gösterir. Adminler için ise terminalden çıkmadan **anahtar oluşturma ve düzenleme, birine ek bütçe verme, bir anahtarı engelleme ve router'ın fallback zincirlerini okuma** imkânı sunar.

Bu depo, tek eklentili bir eklenti marketplace'idir (`cc-litellm`): [`litellm-key`](../../plugins/litellm-key).

<p align="center">
  <img src="../evidence/pane.png" alt="Konuşmanın yanındaki /litellm paneli, gerçek bir LiteLLM proxy'sine karşı" width="92%">
</p>

## Neler sunuyor

| | | |
| --- | --- | --- |
| 👀 **İzleyin** | **Durum satırı** prompt'un altında, her zaman görünür | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm` paneli** | anahtar, takım, kullanıcı ve **takım üyesi** bütçeleri için göstergeler, kullanıcının **rolü**, limitler, son kullanma, modeller, 7 günlük sparkline, haftanın **en çok harcayan modelleri** ve **runway** tahmini; kendini yeniler |
| | **Panel sekmeleri** | **Usage** (günlük harcama, istek veya token çubuklar olarak, 7, 14 veya 30 gün boyunca, seçilecek bir gün, her modelin nasıl değiştiği), **Models** (her birinin harcadığı, bir filtre, bir sıralama), **Details** (anahtarın alanları, LiteLLM'in sürümü ve veritabanı, gecikme) |
| | **Yönlendirme** | **Allowance** (sıfırlanmaya kadar yetmesi için günde ne harcanabilir), **Headroom** (limitin kaç istek daha taşıdığı), **Today** olağan günle karşılaştırılmış, **Session** (bu Claude Code oturumunun harcadığı ve hangi hızla) |
| | **Toast bildirimleri** | %80'de (yapılandırılabilir), %95'te, %100'de; anahtarın süresi dolmak üzere; anahtar engellenmiş veya süresi dolmuş; bugünkü harcama **günlük uyarınızı** aşmış. Bütçe penceresi başına bir kez, oturumlar arasında bile |
| | **Bütçe aşımı banner'ı** | prompt'un üzerinde, **bir bütçe tükendiği sürece ekranda kalan** (anahtar, kullanıcı, takım, pencere veya model) ve yalnızca değerler yeniden normale döndüğünde kalkan kırmızı bir bant |
| 📊 **Raporlayın** | **`/litellm pace`**, `usage`, `compare`, `day`, `status` | bütçenin nereye gittiği, günler ve modeller tablo olarak, önceki günlere göre ne değiştiği, modele göre bir gün |
| | **`/litellm check`** | `OK`, `WARNING`, `CRITICAL` veya `UNKNOWN` **ve bir `claude -p` çalıştırmasının çıkış kodu** (0 ile 3 arası), betikler ve izleme için |
| | **`/litellm json`** / `csv` | her şey JSON olarak, günler CSV olarak; **`copy`** herhangi bir raporu panoya koyar, **`share`** onu Claude'a verir, böylece hakkında soru sorabilirsiniz |
| 🛠️ **Yönetin** *(admin)* | **`/litellm key new`** | sanal anahtar oluşturur; secret **panonuza gider, transkripte asla** |
| | **`/litellm grant`** | bir anahtar, kullanıcı, takım veya organizasyon için ek bütçe; önizleme ve onay ile |
| | **`/litellm key set`** / `reset-spend` | bir anahtarın modellerini, limitlerini, son kullanma tarihini veya alias'ını değiştirir; harcama sayacını sıfırlar |
| | **`/litellm key block`** / `unblock` | bir anahtarı tek satırda durdurur (veya geri açar) |
| | **`/litellm org`** | bir organizasyonun bütçesi; sanal anahtar bunu okuyamaz |
| | **`/litellm keys`** | anahtarları listeler: sizinkiler, bir kullanıcının, bir takımın veya tümü |
| | **`/litellm fallbacks`** | router'ın fallback zincirleri (`cloud/auto → cloud/auto-long → …`) ve ayrıca context-window fallback'leri |

Her değişiklik önce bir **önizleme** gösterir, Claude Code'un **yerel iletişim kutusunda** onay ister, uygular ve ardından sonucu proxy'den **geri okur**.

<a id="install"></a>

## Kurulum

Güncel bir Claude Code gerekir: eklenti, erken erişim API'si olan function hook'larını kullanır; 2.1.289 üzerinde test edildi.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Kurmadan, bir clone üzerinden deneyin: `claude --plugin-dir ./plugins/litellm-key`.

Claude Code zaten LiteLLM ile konuşuyorsa **yapılandıracak bir şey yok**: eklenti, Claude Code'un kullandığı URL'yi ve anahtarı okur. Yönetici komutları ayrıca `litellm_admin_key` ister ([Yönetici komutları](#admin-commands) bölümüne bakın).

## Kısa tur

### Bütçeyi izleyin

<p align="center">
  <img src="../evidence/statusline.png" alt="Claude Code, prompt'un altında litellm-key durum satırıyla" width="92%">
</p>

`/litellm models` anahtarın çağırabileceği modelleri, `/litellm keys` ise sahibi olduğunuz anahtarları listeler:

<p align="center">
  <img src="../evidence/keys.png" alt="/litellm models ve /litellm keys çıktısı" width="92%">
</p>

### Yakından bakın: kullanım, modeller, ayrıntılar

Panelin dört sekmesi var. Overview yukarıdaki gösterge tablosudur; **Usage** son 7, 14 veya 30 günü çubuklarla çizer, harcamayı, istekleri veya token'ları sayar, modellerini görmek için bir gün seçmenize izin verir ve önceki günlere göre hangi modelin değiştiğini söyler:

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

**Models** anahtarın çağırabildiklerini, aralık boyunca her modelin harcadığıyla birlikte listeler (harcamaya veya ada göre sıralayın, uzun bir listeyi daraltmak için filtreye yazın); **Details** proxy'nin anahtar hakkında söylediklerini, LiteLLM sürümünü ve veritabanı durumunu, ayrıca `/key/info`'nun ne kadar sürdüğünü bir araya getirir. Seçtiğiniz aralık, sıralama ve grafik bir sonraki sefer için hatırlanır ve `/litellm` paneli bıraktığınız sekmede açar.

### Rapor isteyin ya da bir betiğe verin

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

### Sorunu erkenden yakalayın ve adını koyun

Eklenti, genel bir *401* yerine engellenmiş anahtarı, süresi dolmuş anahtarı ve yanlış anahtarı birbirinden ayırır:

<table>
  <tr>
    <td width="50%"><img src="../evidence/warning.png" alt="Bütçenin %86'sı kullanıldı"><br><sub><b>%86</b>: uyarı toast'ı ve durum satırı</sub></td>
    <td width="50%"><img src="../evidence/over-budget.png" alt="Bütçe aşıldı"><br><sub><b>Bütçe aşımı</b>: bütçe normale dönene kadar ekranda kalan bir banner</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/blocked.png" alt="Anahtar engellendi"><br><sub><b>Engellenmiş</b> anahtar, engellenmiş olarak adlandırılır</sub></td>
    <td width="50%"><img src="../evidence/expired.png" alt="Anahtarın süresi doldu"><br><sub><b>Süresi dolmuş</b> anahtar, süresi dolmuş olarak adlandırılır</sub></td>
  </tr>
</table>

### Anahtar üretin

<table>
  <tr>
    <td width="50%"><img src="../evidence/key-new-dialog.png" alt="Anahtar oluşturmadan önce yerel onay"><br><sub>Önce önizleme, ardından Claude Code'un yerel onayı</sub></td>
    <td width="50%"><img src="../evidence/key-new-done.png" alt="Anahtar panoya kopyalandı"><br><sub>Secret panoya gider. Transkript yalnızca <code>sk-…9FKg</code> değerini görür</sub></td>
  </tr>
</table>

### Ek bütçe verin

<table>
  <tr>
    <td width="50%"><img src="../evidence/grant-dialog.png" alt="Bütçe artışının önizlemesi"><br><sub><code>$25 → $35 (+$10)</code>, harcanan tutar ve geriye kalacak tutar</sub></td>
    <td width="50%"><img src="../evidence/grant-recovers.png" alt="Anahtarın artıştan sonra yeniden bütçe payı var"><br><sub>Uygulandı ve geri okundu; durum satırı da buna uyar (%101 → %79)</sub></td>
  </tr>
</table>

### Takım her üyeye üst sınır koyduğunda

Bir takım, her üyenin harcayabileceği tutara üst sınır koyabilir (`team_member_budget`). Anahtarın kendi bütçesi yerindeyken bile proxy isteği reddeder; bu yüzden eklenti bu üst sınırı okuyup `Member` göstergesi olarak gösterir ve bütçe aşımı banner'ı da onu adıyla anar:

<p align="center">
  <img src="../evidence/member-cap.png" alt="Üst sınırı aşan bir Member göstergesi, prompt'un üzerindeki banner ve adı gösterilen anahtarın organizasyonu ile panel" width="92%">
</p>

<sub>`dev/mock-litellm.py --scenario member` üzerinde çekildi. Proxy, sanal anahtara üyenin toplamını bildirmez; bu yüzden gösterge <b>bu anahtarın harcamasını</b> sayar ve bunu açıkça belirtir. Düşük okunabilir; sıfırlanan bir üst sınır söz konusuysa yüksek de okunabilir (sıfırlama üyenin harcamasını sıfırlar, anahtarınkini değil), bu yüzden banner yalnızca hiç sıfırlanmayan bir üst sınır için gösterilir. Anahtarın organizasyonunun da adı gösterilir; bütçesi yalnızca admin içindir, onu <code>/litellm org</code> okur.</sub>

### Fallback zincirlerini okuyun

<p align="center">
  <img src="../evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Bir modelin maliyetini öğrenin

<p align="center">
  <img src="../evidence/models-prices.png" alt="Milyon token başına giriş ve çıkış fiyatını ve context window'u gösteren /litellm models" width="92%">
</p>

### Ve proxy de aynı fikirde

Yukarıdakilerin hepsi, eklentinin yaptıklarını yansıtan gerçek LiteLLM v1.99.1 yönetici arayüzüdür:

<table>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-keys.png" alt="LiteLLM arayüzü, Virtual Keys"><br><sub>Claude Code'dan oluşturulan ve artırılan anahtarlar; biri süresi dolmuş</sub></td>
    <td width="50%"><img src="../evidence/litellm-ui-usage.png" alt="LiteLLM arayüzü, Usage"><br><sub>Harcama Usage'da görünür</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="../evidence/litellm-ui-users.png" alt="LiteLLM arayüzü, Internal Users"><br><sub>Kullanıcının proxy rolü (<code>internal_user</code>, <code>proxy_admin</code>), panelin <b>Role</b> satırında görünen değerdir</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `/litellm` | Paneli bıraktığınız sekmede açar (ve tek satırlık bir özetle yanıt verir). Ekran yoksa o sekmeyi metin olarak yazdırır. |
| `/litellm tab <name>` | Paneli `overview`, `usage`, `models` veya `details` sekmesinde açar (ya da 1 ile 4 arası). |
| `/litellm refresh` | Şimdi yeniden okur. |
| `/litellm info` | Tam özeti transkripte yazdırır. |
| `/litellm status` | Durum satırını metin olarak yazdırır. |
| `/litellm pace` | Bütçenin nereye gittiğini, yetmesi için günde ne harcayabileceğini ve aynısını takım ile kullanıcı için gösterir. |
| `/litellm usage [7\|14\|30]` | Günlük harcama, istek ve token'ı bir tablo olarak, toplamlar ve modellerle birlikte gösterir. |
| `/litellm compare [7\|14]` | Son tam günleri, öncesindeki aynı sayıda günle karşılaştırır; bütün olarak ve model model. |
| `/litellm day [when]` | Modele göre bir gün: `today`, `yesterday`, `2026-10-03`, `10-03` veya haftanın bir günü (`mon`). |
| `/litellm models [text]` | Bu anahtarın çağırabileceği modelleri, milyon token başına fiyatları ve context window ile birlikte listeler; bir metin verilirse yalnızca adında o metin geçenleri. |
| `/litellm check [warn%]` | `OK`, `WARNING`, `CRITICAL` veya `UNKNOWN` ve bir `claude -p` çalıştırmasının çıkış kodu: 0, 1, 2, 3. Limitini aşmış bir bütçe ya da proxy'nin engellenmiş, süresi dolmuş veya reddedilmiş dediği bir anahtar `CRITICAL`'dır; yanıt vermeyen bir proxy `UNKNOWN`'dur. |
| `/litellm json` | Eklentinin anahtar hakkında bildiği her şeyi JSON olarak yazdırır (anahtar ve hash olmadan). |
| `/litellm csv [7\|14\|30]` | Günleri CSV olarak yazdırır. |
| `/litellm copy [what]` | Bir raporu panoya koyar: `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` veya `json`. |
| `/litellm share [what]` | Bir raporu Claude'a görünmeden verir, böylece sonraki soru onun hakkında olabilir. |
| `/litellm ping` | Eklentinin okuduğu her endpoint'i durumu ve süresiyle birlikte dener. |
| `/litellm debug` | URL'nin ve anahtarların nereden geldiğini (her zaman maskeli), nelerin denendiğini ve sonucu gösterir. |
| `/litellm close` | Paneli kapatır. |
| `/litellm keys [--user ID \| --team ID \| --all]` | Anahtarları listeler. Varsayılan: kendi kullanıcınızın anahtarları. 🔐 |
| `/litellm key new <alias> [flags]` | Anahtar oluşturur. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Bir anahtarı engeller veya geri açar. 🔐 |
| `/litellm key set <alias\|hash> [flags]` | Bir anahtarın modellerini, limitlerini, son kullanma tarihini veya alias'ını değiştirir. 🔐 |
| `/litellm key reset-spend <alias\|hash>` | Bir anahtarın harcama sayacını sıfıra döndürür. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | Bütçe ekler. 🔐 |
| `/litellm org [id\|alias]` | Bir organizasyonun bütçesi; ad verilmezse: anahtarın kendi organizasyonu, yoksa liste. 🔐 |
| `/litellm fallbacks [model]` | Router fallback zincirleri; isteğe bağlı olarak adı eşleşen modeller için. 🔐 |

🔐 = yönetici komutu, aşağıya bakın. Panelde (tıklayarak veya `ctrl+x` `tab` ile odaklanın): `1` ile `4` arası sekme değiştirir, `r` yeniler, `c` bulunduğunuz sekmeyi kopyalar, `q` kapatır, ok tuşları kaydırır; her düğme kendi tuşunu belirtir (`Refresh (r)`, `Copy (c)`, `Close (q)`). Usage'da `d` 7, 14 ve 30 günü dolaşır, `m` harcama, istek ve token arasında geçer, `v` günleri CSV olarak kopyalar; Models'ta `s` sıralar, `f` filtreye gider. `Esc` de boş bir prompt'ta paneli kapatır (Models'ta yalnızca filtreden çıkar).

Yanlış yazılmış bir komut bir tahmin alır (`Did you mean "usage"?`). İstenileni yapamayan bir komut bunu tek cümleyle söyler; betikler için tasarlananlar (`check`, `json`, `csv`, `ping`) bildirilecek bir şey olmadığında 3 çıkış koduyla biter.

Panel, mevcut alana uyum sağlar: konuşmanın yanında (tam ekran, 110 sütundan itibaren) her gösterge iki satır kaplar; prompt'un üzerinde, 122 sütundan itibaren göstergeler tabloya dönüşür; daha dar terminallerde gösterge başına iki satırı korur ya da `compact_pane` seçeneğini etkinleştirirseniz **kompakt** hâle gelir. Konuşmanın yanında panel, başlıklı bölümler (`BUDGETS`, `KEY`, `LAST 7 DAYS`, `TOP MODELS`) gösterir ve haftanın her gününün altına bir harf koyar; `TOP MODELS` en çok harcayan beş modeli sıralar, her birinin haftadaki payını bir çubuk olarak gösterir. Uzun bir ad ortadan kısaltılır, böylece `claude-sonnet-4-5` ile `claude-sonnet-4-6` birbirinden ayırt edilebilir kalır. Renk hiçbir zaman tek sinyal değildir: `▲` üst sınırına yaklaşmış bir bütçeyi, `✖` tükenmiş bir bütçeyi işaretler; harcama olmayan gün kısa bir çubuk değil, bir `·` olarak görünür.

**Runway.** `Runway` satırı (panelde ve `/litellm info` içinde) son 7 günün harcama hızını (bundan genç bir anahtar için daha az gün, ama hiçbir zaman birden az değil) üst sınırla karşılaştırır: `lasts until the reset at $2.18/day`, ya da bütçe önce tükenecekse `out in 2d 6h at $2.18/day · resets in 6d 12h`. Durum satırı `out in 2d 6h at this pace` ifadesini yalnızca bu yaklaşıyorsa ekler: sıfırlamadan önce ya da sıfırlaması olmayan bir anahtar için 3 gün içinde. Üst sınırı olmayan bir anahtar, zaten tükenmiş bir anahtar ve sıfırlaması gelmiş bir anahtar için tahmin gösterilmez.

<p align="center">
  <img src="../evidence/runway.png" alt="Tükenmek üzere olan bir anahtarın paneli: Runway satırı ve durum satırı uyarır, hafta modellere göre bölünmüştür" width="92%">
</p>

<sub>`dev/mock-litellm.py --scenario warning` üzerinde çekildi: yerel laboratuvarda tahmin yapılabilecek bir haftalık geçmiş yok.</sub>

<p align="center">
  <img src="../evidence/help.png" alt="/litellm help çıktısı" width="92%">
</p>

<a id="admin-commands"></a>

## Yönetici komutları

Anahtarları okumak ve değiştirmek için proxy admin yetkisi gerekir. **`litellm_admin_key`** seçeneğini ayarlayın (işletim sisteminizin kimlik bilgisi deposunda saklanır, `settings.json` içinde asla). Bu anahtar olmadan eklenti sanal anahtarınızla dener ve proxy reddederse bunu size açıkça söyler.

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

| `key new` bayrağı | Anlamı |
| --- | --- |
| `--budget 10` | Dolar cinsinden harcama üst sınırı. |
| `--every 30d` | Bütçe penceresi: her 30 günde bir sıfırlanır (`s m h d w mo`). |
| `--soft 8` | Yumuşak uyarı eşiği. |
| `--models a,b` | Anahtarın çağırabileceği modeller (varsayılan: hepsi). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Hız sınırları. |
| `--expires 30d` | Anahtar bu süre sonunda çalışmayı bırakır. |
| `--user ID` / `--team ID` | Sahibi kim (ve kimin bütçesi de geçerli olur). |

| `key set` bayrağı | Anlamı |
| --- | --- |
| `--models a,b` / `--models all` | Anahtarın çağırabileceği modelleri değiştirir (`all`: tüm modeller). |
| `--rpm N` / `--tpm N` / `--parallel N` | Bir limit belirler; `none` limiti kaldırır. |
| `--expires 30d` / `--expires never` | Şu andan itibaren bu süre sonra sona erer ya da hiç sona ermez. |
| `--alias NEW` | Anahtarı yeniden adlandırır. |

Belirtmediğiniz bir alan olduğu gibi kalır. Önizleme her alan için `before → after` değerini gösterir ve anahtar Claude Code'un kullandığı anahtarsa uyarır.

Her yönetici komutunda geçerli güvenlik önlemleri:

- **Önce önizleme.** `--dry-run` burada durur; `--yes` onayı atlar; aksi hâlde Claude Code'un yerel iletişim kutusu sorar (**Apply** / **Cancel**).
- **Geri okuma.** Bir grant'ten sonra eklenti bütçeyi proxy'den yeniden okur ve gönderdiğinizi değil, orada *olanı* bildirir.
- **Yeni secret transkripte asla düşmez.** Panoya gider. Pano kabul edemezse anahtar, okunamaz hâlde tutulmak yerine **yeniden silinir** (rollback). `--reveal` anahtarı yazdırır ve artık transkriptte kayıtlı olduğuna dair bir uyarı gösterir.
- **Ham `sk-…` değerleri anahtar referansı olarak reddedilir**: alias veya anahtar hash'i kullanın. Bilinmeyen bayraklar sessizce yok sayılmaz, hata verir.
- **Dürüst rakamlar.** `grant`; harcama yeni bütçeyi zaten aştığında, üzerine eklenecek bir üst sınır olmadığında (`--set` kullanın), hiçbir şeyin değişmeyeceği durumda ve `--user` proxy'nin hiç görmediği bir kullanıcı oluşturacağında bunu söyler.
- **Admin anahtarı** yalnızca oturumunuzun kendi anahtarını zaten kabul etmiş proxy'ye gönderilir ve asla yazdırılmaz (hatalar maskelenir).

LiteLLM v1.99.1 ve v1.104.0'da bugün ek bütçe olarak *verilebilenler*: bir **anahtar** bütçesini, bir **kullanıcı** bütçesini veya bir **takım** bütçesini (`--team`, proxy admin gerektirir) artış olarak ya da mutlak değer olarak (`--set`) yükseltmek. Bir **organizasyon** bütçesi (`--org`) v1.101'e kadar çalışır; v1.102'den itibaren proxy organizasyonları enterprise lisanslarına ayırır ve eklenti bunu söyler. *Geçici* bütçe artışı (`temp_budget_increase`) ve model başına bütçeler proxy tarafında yalnızca enterprise sürümündedir ([Bütçeler](#budgets-what-litellm-can-and-cannot-do) bölümüne bakın); bu yüzden eklenti, varmış gibi davranmak yerine bunları sunmaz.

<a id="budgets-what-litellm-can-and-cannot-do"></a>

## Bütçeler: LiteLLM neleri yapabilir, neleri yapamaz

LiteLLM v1.99.1'e karşı canlı olarak doğrulandı (açık kaynak proxy, lisanssız); üye üst sınırı ve organizasyonlar ayrıca v1.104.0 üzerinde de doğrulandı:

| Bütçe | Çalışıyor mu? | Nasıl |
| --- | --- | --- |
| **Anahtar** başına (üst sınır + sıfırlama penceresi) | ✅ | `/litellm key new --budget 10 --every 30d`; `/litellm grant 5 --key NAME` ile artırın |
| **Kullanıcı** başına | ✅ | `/litellm grant 5 --user ID` (kullanıcının sahip olduğu her anahtar için geçerlidir) |
| **Takım** başına | ✅ | `/litellm grant 50 --team NAME` (proxy admin gerektirir) |
| Takımın **üyesi** başına (`team_member_budget`) | 👀 salt okunur | kullanıcının o takımdaki isteklerini engeller (HTTP 429, v1.104'ten itibaren 422). Panel üst sınırı `Member…` olarak gösterir; LiteLLM arayüzünden veya API'sinden ayarlayın. Sanal anahtar üyenin toplamını okuyamaz, bu yüzden gösterge **bu anahtarın harcamasını** sayar ve bunu açıkça belirtir. Sıfırlama üyenin harcamasını sıfırlar ama anahtarınkini sıfırlamaz; bu yüzden bütçe aşımı banner'ı yalnızca hiç sıfırlanmayan bir üst sınır için gösterilir, sıfırlanan bir üst sınırda gösterge uyarır, engellendiğini iddia etmez |
| **Organizasyon** başına | ✅ v1.101'e kadar · ⛔ v1.102'den itibaren enterprise | içindeki her anahtarı engeller (HTTP 429). Sanal anahtar bunu okuyamaz: panel organizasyonun adını gösterir, `/litellm org` bütçeyi gösterir (admin), `grant --org` artırır |
| Bir anahtarda birden çok pencere (`budget_limits`, örn. saatte $5 + ayda $50) | salt okunur | proxy'de varsa `Window 1h` göstergeleri olarak gösterilir |
| Bir anahtarda **model** başına (`model_max_budget`) | ⛔ enterprise | proxy, `/budget/new` için de *"You must have an enterprise license to set model_max_budget"* yanıtını verir. Proxy'nizde lisans varsa panel bu göstergeleri gösterir (`Model gpt-4o`) |
| Geçici bütçe artışı (`temp_budget_increase`) | ⛔ enterprise | açık kaynak proxy alanı kabul eder ama hiçbir zaman uygulamaz |

**Lisans olmadan model başına bütçe:** her model için, kendi üst sınırı olan ayrı bir anahtar oluşturun, örn.
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. Anahtar yalnızca o modeli çağırabilir ve $5'ta durur.

## Yapılandırma

Eklenti, Claude Code'un kullandığı URL'yi ve anahtarı şu sırayla okur (önce süreç değişkenleri, sonra `settings.json` içindeki `env` bloğu):

| Ne | Kaynak |
| --- | --- |
| URL | `litellm_url` seçeneği, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Anahtar | `litellm_key` seçeneği, `ANTHROPIC_CUSTOM_HEADERS` içindeki `x-litellm-api-key` header'ı, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

URL bir pass-through rotasıyla bitiyorsa (`/anthropic`, `/bedrock`, `/v1`…), eklenti proxy kökünü de dener. Bir anahtar yalnızca ait olduğu URL ile kullanılır: ortam değişkenlerindeki anahtarlar başka bir host'taki `litellm_url`'e asla gitmez ve `LITELLM_PROXY_API_BASE` yalnızca `LITELLM_PROXY_API_KEY` ile eşleşir.

Tüm seçenekler isteğe bağlıdır (Claude Code kurulumda bunların "ayarlanmadığını" söyler; bu zararsızdır). Bunları `/plugin configure litellm-key@cc-litellm` ile ya da string'lerden oluşan bir JSON nesnesiyle `claude plugin configure litellm-key@cc-litellm --values-stdin` komutuyla değiştirin.

| Seçenek | Varsayılan | Amaç |
| --- | --- | --- |
| `litellm_url` | boş | Varsayılan olmayan bir yerdeki proxy (LiteLLM üzerinden Bedrock/Vertex, önek içeren URL). |
| `litellm_key` | boş | Açıkça belirtilmiş bir anahtar. 🔒 kimlik bilgisi deposunda saklanır, `settings.json` içinde değil. |
| `litellm_admin_key` | boş | `keys`, `key new/set/reset-spend/block/unblock`, `grant`, `org`, `fallbacks` için admin anahtarı. 🔒 aynı depolama. Asla yazdırılmaz. |
| `refresh_seconds` | 60 | Okuma aralığı (15 ila 3600). Her turdan sonra da okur, en fazla 20 sn'de bir. |
| `warn_percent` | 80 | İlk bütçe uyarısı (%95 ve %100'de de uyarır). |
| `daily_alert` | 0 (kapalı) | Anahtarın bugünkü harcaması bu dolar tutarına ulaştığında uyarır: günde bir toast, durum satırı ve panel. Açıkken kullanım geçmişi 3 dakikada bir okunur. |
| `show_toasts` | evet | Bütçe, günlük uyarı, süresi dolmak üzere olan anahtar ve çalışmayan proxy hakkında uyaran toast'lar. Kapalıyken uyarılar durum satırında ve panelde kalır. |
| `show_status_line` | evet | Prompt'un altındaki satır. |
| `show_related` | evet | `/user/info` ve `/team/info` okunur: bu bütçeler de istekleri engelleyebilir. |
| `show_usage` | evet | `/user/daily/activity` okunur (beta bir LiteLLM endpoint'i): Usage ve Models sekmelerinin, raporların, runway'in ve günlük uyarının dayandığı son 30 günlük kullanım. |
| `compact_pane` | hayır | Dar terminallerde (74 ila 121 sütun) prompt'un üzerinde kompakt panel: satır başına bir gösterge, bilgiler yan yana. |

## Verilerin geldiği yer

**İzleme** yalnızca okur (`GET`), her zaman kendi anahtarınızla:

| Endpoint | Amaç |
| --- | --- |
| `/key/info` | Alias, harcama, bütçe ve pencereler, sıfırlama, limitler, son kullanma, durum, modeller, model başına bütçeler. Her okumada. |
| `/user/info`, `/team/info` | Anahtarın kullanıcısının ve takımının bütçesi ile takımın üye başına üst sınırı (üst sınır varsa). Her okumada. |
| `/v1/models` | Gerçekte izin verilen modeller. 10 dakikada bir. |
| `/model_group/info` | Bu modellerin token başına fiyatı ve context window'u (proxy tüm modelleri için yanıt verir, eklenti izin verilenleri tutar). 10 dakikada bir. |
| `/user/daily/activity` | Son 30 günün harcaması, istek ve token sayıları ile modelleri, gün gün. 10 dakikada bir. |
| `/health/readiness` | LiteLLM'in sürümü ve veritabanının bağlı olup olmadığı. 10 dakikada bir; proxy söylemezse hiçbir şey gösterilmez, bir not bile. |

“10 dakikada bir” olarak işaretlenen okumalar, bir `daily_alert` ayarlıyken 3 dakikada bir yapılır: izlediği şey bugünkü harcamadır.

**Yönetim** yalnızca bir yönetici komutu yazdığınızda gerçekleşir: `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/organization/info`, `/organization/list`, `/router/settings` ve `POST /key/generate`, `/key/delete` (yalnızca rollback), `/key/block`, `/key/unblock`, `/key/update`, `/key/{hash}/reset_spend`, `/user/update`, `/team/update`, `PATCH /organization/update`.

Her istek en fazla 4 sn bekler (yönetici komutlarında 15 sn). Başarısız olan isteğe bağlı bir okuma (403, 404…) panelde sessiz bir nota dönüşür, asla hata olmaz. Proxy çökerse panel son başarılı okumayı eski (stale) olarak işaretleyerek korur. LiteLLM harcamayı veritabanına toplu olarak yazar; bu yüzden rakamlar gerçek harcamanın yaklaşık 10 saniye gerisinde kalır.

## Gizlilik ve güvenlik

- Anahtarınız yalnızca Claude Code'un zaten kullandığı proxy'ye, `Authorization` (veya `x-litellm-api-key`) header'ında gider. Hiçbir zaman bir URL'de, log'da, toast'ta, state'te ya da eklentinin depolamasında yer almaz; hata mesajları onu maskeleyen bir filtreden geçer.
- Admin anahtarı yalnızca oturum anahtarınızı zaten kabul etmiş proxy köküne ve yalnızca bir yönetici komutu yazdığınızda gönderilir.
- Eklenti, tekrarı önlemek için yalnızca daha önce gösterdiği uyarıların kimliklerini saklar.
- `litellm-key`; `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` ve `LITELLM_PROXY_API_KEY` değişkenlerini ile `settings.json` içindeki `env` bloğunu okur ve HTTP istekleri yapar. `claude plugin validate plugins/litellm-key` bunların hepsini listeler.

## Bir şey görünmüyorsa

| Belirti | Olası neden |
| --- | --- |
| Durum satırında hiçbir şey yok, toast "not configured" diyor | Claude Code bir proxy'nin arkasında değil (`ANTHROPIC_BASE_URL` yok veya `api.anthropic.com`). |
| "The proxy has no database record for this key" | Master anahtar ya da yalnızca `config.yaml` içinde tanımlı bir anahtar. Yalnızca `/key/generate` ile oluşturulan anahtarların verisi vardır. |
| "The proxy has no database" | Proxy `DATABASE_URL` olmadan çalışıyor: okunacak sanal anahtar yok. |
| "does not look like a LiteLLM proxy" | URL başka bir şeye işaret ediyor. `litellm_url` değerini proxy köküne ayarlayın. |
| "key blocked" / "key expired" | Tam olarak bu. Bir admin'e danışın ya da başka bir oturumdan `/litellm key unblock` çalıştırın. |
| "key rejected (401)" | Geçersiz anahtar. |
| Kullanım geçmişi yok | Anahtarın `user_id` değeri yok ya da beta endpoint LiteLLM sürümünüzde bulunmuyor. |
| Yönetici komutu admin anahtarı gerektiğini söylüyor | `litellm_admin_key` ayarlayın. |
| Yönetici komutu "until the proxy accepts this session's key" diye bekliyor | Tasarım gereği, admin anahtarı yalnızca sizin kendi anahtarınızı kabul etmiş bir proxy'ye gönderilir. O anahtarı başka bir oturumdan veya LiteLLM arayüzünden düzeltin. |

`/litellm debug` eklentinin neyi çözümlediğini gösterir.

## Dizüstü bilgisayarınızda gerçek bir LiteLLM ile deneyin

`dev/litellm` eksiksiz bir laboratuvardır: Docker'da Postgres 18 ile LiteLLM v1.104.0; böylece sanal anahtarlar, bütçeler ve harcama gerçektir. CI, her değişiklikte bunu başlatır ve smoke testini çalıştırır.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (varsayılan), gerçek bir "auto" kurulumunu yansıtır: ağırlıklı bir `cloud/auto` grubu, bir fallback zinciri, bir context-window fallback'i ve router'ın fallback'e düştüğünü gözle görülür kılan, her zaman başarısız olan bir model (`demo/always-429`). Hiçbir şey makinenizden çıkmaz.
- **Kendi cluster'ınızın routing'i:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` komutu, proxy'nizin `config.yaml` dosyasını ve **yalnızca** onun başvurduğu provider değişkenlerini okur (salt okunur, `kubectl`) ve yerel bir `config.cluster.yaml` + `.env` yazar (git-ignored: asla commit etmeyin). Ardından `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`**, arayüz durumları için (`--scenario warning|blocked|…`) Docker'sız çalışan küçük bir sahte proxy'dir.
- **`dev/evidence/`**, bu README'deki her ekran görüntüsünü alan harness'tir: bir ConPTY içinde gerçek bir Claude Code, PNG olarak render edilmiş. Bkz. [`dev/evidence/README.md`](../../dev/evidence/README.md).

## Geliştirme

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Eklentinin yapısı: `hooks/register.tsx`, Claude Code'un `$` nesnesine dokunan tek dosyadır; enjekte edilen portları (`hooks/ports.ts`) oluşturur ve olayları, komutları, zamanlayıcıları ve toast'ları bağlar. Geri kalan her şey bu portları alan düz fonksiyonlardır; bu yüzden motoru başlatmadan testte çalışırlar. `hooks/session.ts` okuma döngüsüdür (yapılandırma, ticker, kuyruğa alınmış zorunlu yenileme); `hooks/credentials.ts` ve `hooks/settings.ts` anahtarı ve seçenekleri çözer; `hooks/litellm.ts` proxy'yi okur, `hooks/parsers.ts` ve `hooks/json.ts` yanıtları normalleştirir, `hooks/failures.ts` neyin ters gittiğini adlandırır; `hooks/alerts.ts` toast'lara karar verir. `hooks/commands.ts` `/litellm` komut tablosudur, `hooks/admin*.ts` ise yönetici komutlarıdır (`admin.ts` proxy okumaları, `admin-targets.ts` anahtar, kullanıcı ve takım aramaları, `admin-writes.ts` yazmaları, `admin-plan.ts` önizlemeler ve planlar, `admin-link.ts` admin anahtarının proxy'ye bağlantısı, `admin-commands.ts` akış, `args.ts` argüman ayrıştırıcı). `hooks/exceeded.ts` ve `hooks/band.tsx` bütçe aşımı banner'ıdır; `hooks/summary.ts` metni, `hooks/view.tsx` ve `hooks/parts.tsx` paneli (kadran, bölüm başlıkları, durum çipi, gösterge satırları) oluşturur; `hooks/format.ts` saf biçimlendiricileri içerir; `types/index.d.ts` state sözleşmesidir. Sekmeler `hooks/tab-*.tsx` dosyalarıdır (`tab-overview.tsx` panelin sekmelerden önceki gösterge tablosu, `parts-tabs.tsx` ortak parçaları, `chart.ts` çubuklar); raporlar `hooks/report-*.ts`, `details.ts` ve `probe.ts` (`/litellm ping`) dosyalarıdır ve `history.ts` (30 gün, toplamlar ve karşılaştırmalar) ile `guidance.ts` (allowance, headroom, today ve oturum) üzerinde durur. `hooks/commands-reports.ts` ve `commands-share.ts`, bir raporu yazdıran veya veren komutlardır.

## Bilinen sınırlar

- `apiKeyHelper` okunmaz (kullanıcı komutu çalıştırmak kapsam dışıdır). `litellm_key` kullanın.
- `/user/daily/activity` LiteLLM'de betadır ve değişebilir.
- Model başına bütçeler (`model_max_budget`), geçici bütçe artışları ve anahtar yeniden üretimi proxy tarafında yalnızca enterprise sürümündedir; bu yüzden sunulmaz ([Bütçeler](#budgets-what-litellm-can-and-cannot-do) bölümüne bakın). Fallback zincirlerini düzenlemek proxy'de `STORE_MODEL_IN_DB=True` gerektirir; bu yüzden `/litellm fallbacks` salt okunur kalır.
- Bir **organizasyonun** bütçesi anahtarın kendi yanıtında yoktur ve sanal anahtar onu okuyamayabilir; bu yüzden panel yalnızca organizasyonun adını gösterir, `/litellm org` onu admin anahtarıyla okur. Admin anahtarı yine yalnızca bir yönetici komutu yazdığınızda gönderilir, yenileme zamanlayıcısında asla.
- Bir takım **üyesinin** toplamı sanal anahtara bildirilmez: `Member` göstergesi yalnızca bu anahtarın harcamasını sayar, bu yüzden düşük okunabilir: kullanıcının takımda birden çok anahtarı varsa proxy, göstergenin söylediğinden daha erken engelleyebilir. Sıfırlanan bir üst sınırda yüksek de okunabilir (sıfırlama üyenin harcamasını sıfırlar, anahtarınkini değil); orada gösterge uyarır, banner ise sessiz kalır.
- Kullanım geçmişi, proxy'nin etkinlik satırlarının bir sayfasını okur; daha fazlası olduğunda panel bunun kısmi olduğunu söyler. Günler UTC'dir, proxy'nin saydığı gibi; bugünkü hâlâ sürüyor, bu yüzden karşılaştırmalar onu dışarıda bırakır.
- **Session** satırı, anahtarın harcamasının bu Claude Code oturumunun ilk okumasından beri ne kadar arttığını sayar. Bu oturumun harcamasını, aynı anahtarı kullanan başka bir oturumunkinden ayıramaz.
- Bütçe aşımı banner'ı terminal ve masaüstü yüzeylerinde çizilir (Claude Code bandı yalnızca orada sunar); diğerlerinde bunu durum satırı ve panel söyler.
- Durum satırından önceki `⚠`, her eklenti durum girdisi için Claude Code tarafından çizilir; anahtarın sorunlu olduğu anlamına gelmez (bunu metin söyler).
- Claude Code'un eklenti API'si erken erişimdedir ve sürümler arasında değişebilir.

## Lisans

[MIT](../../LICENSE).

## Diğer diller

[English](../../README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Türkçe](README.tr.md) · [हिन्दी](README.hi.md)
