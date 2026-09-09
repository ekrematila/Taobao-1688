# Taobao Product Studio (rebuilt)

Taobao/1688 ürünlerini çekip **AI ile Shopify ve Etsy listelemelerine** dönüştüren iş akışı aracı.
`https://taobaoapp-g3zay2q7.manus.space` uygulamasının sıfırdan, daha iyi bir sürümü.

## Ne değişti / neler eklendi

| Alan | Önceki | Bu sürüm |
|---|---|---|
| Akış | Tek uzun dikey sayfa | 3 adımlı sihirbaz + ilerleme, `g 1..5` klavye kısayolları |
| Tema | Açık ağırlıklı | Sistem / açık / koyu, erişilebilir odak halkaları |
| Dil | Sabit TR | Tam TR / EN (tüm ekranlar, düzenleyici, çeviri paneli, maliyet paneli dahil) — sol alttaki dil düğmesi |
| Görsel | Kadraj şablonu yok | Etsy 2000², Shopify 4:5, kare, geniş; filigran; tekli + toplu PNG/ZIP |
| Önizleme | Yok | Canlı Etsy/Shopify kart + HTML açıklama önizlemesi |
| Dışa aktarma | Shopify CSV + Etsy klasör | + WooCommerce CSV + ham JSON, hepsi arşivlenir |
| Dayanıklılık | — | Her adım SQLite'a yazılır; sayfa yenilense de taslak kaybolmaz + sürüm geri alma |
| Maliyet | Token tahmini | Gerçek Anthropic token muhasebesi, işlem başına kayıt |
| API katmanı | tRPC | Sade tipli REST — daha az bağımlılık, daha kolay bakım |

## Kurulum

```bash
cd taobao-product-studio
npm install
cp .env.example .env      # sonra .env içini doldurun
npm run dev
```

- Web (geliştirme): http://localhost:5173
- API: http://localhost:8787

Prod:

```bash
npm run build && npm start   # http://localhost:8787 tek portta servis eder
```

## .env

| Değişken | Zorunlu | Ne için |
|---|---|---|
| `ONEBOUND_KEY`, `ONEBOUND_SECRET` | evet | Taobao/1688 verisi (onebound.cn). Ayarlar sayfasından da güncellenebilir. |
| `ANTHROPIC_API_KEY` | içerik için | Listeleme üretimi, varyant çevirisi, alt metin. Tüm Claude modelleri UI'dan seçilebilir. |
| `LLM_MODEL` | hayır | Varsayılan model id (`claude-sonnet-5`). Diğerleri: opus-5 / opus-4-8 / opus-4-7 / opus-4-6 / sonnet-4-6 / haiku-4-5 / fable-5 |
| `MANUS_API_KEY` | görsel çevirisi için | Manus API v2 (`api.manus.ai`, `x-manus-api-key`). Görsellerdeki Çince yazıların çevirisi ajan görevi olarak çalışır. |
| `MANUS_AGENT_PROFILE` | hayır | `manus-1.6` (varsayılan) / `-lite` / `-max` |
| `MANUS_USD_PER_CREDIT` | hayır | Maliyet paneli için 1 Manus kredisinin USD değeri (varsayılan 0.01) |
| `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` | opsiyonel | "Shopify'a taslak gönder" düğmesi |
| `PREVIEW_REFERENCE_URL` | hayır | Final önizleme düzeni için referans mağaza ürün URL'i |
| `APP_PASSWORD` | opsiyonel | Boşsa auth kapalı; doluysa tek parolalı giriş |

## Model / sürüm seçimi — kanıt

**Claude (Anthropic):** Model seçimi resmî bir istek parametresidir — `POST /v1/messages` gövdesinde
`"model": "<id>"`. 8 modelin hepsi Ayarlar ve Teslim ekranındaki açılırda seçilebilir.
Ayarlar → Claude → **"API'yi doğrula"** butonu `GET /v1/models` çağırır ve anahtarınızın gerçekte
erişebildiği model listesini canlı gösterir (test edildi: `claude-opus-5`, `claude-sonnet-5`,
`claude-fable-5`, `claude-opus-4-8/4-7/4-6/4-5`, `claude-sonnet-4-6/4-5`, `claude-haiku-4-5`).

### Claude — hızlı ↔ zeki + tüm özellikler

`@anthropic-ai/sdk` 0.122'ye yükseltildi. Ayarlar → **Claude gelişmiş** (veya `.env`):

| Kontrol | Ne yapar | .env |
|---|---|---|
| **Effort** (low → max) | `output_config.effort` — düşük = hızlı/ucuz, yüksek = zeki | `LLM_EFFORT` |
| **Adaptif düşünme** | `thinking: {type:"adaptive"}` ↔ `{type:"disabled"}` (xhigh/max effort'ta otomatik high'a düşürülür) | `LLM_THINKING` |
| **Fast mode** | `speed:"fast"` + `fast-mode-2026-02-01` beta, 2.5× hız — yalnızca `claude-opus-5`/`claude-opus-4-8`. Org fast mode için etkin değilse (429) uygulama sessizce standart moda döner. | `LLM_FAST` |
| **Prompt caching** | Sistem promptu her istekte `cache_control: ephemeral` — tekrarlı üretimlerde girdi maliyeti ~%90 düşer. Otomatik. | — |

Maliyet paneli cache-read/cache-write token fiyatlandırmasını da hesaba katar.

**Manus:**
- **Sürüm/kapasite:** `agent_profile` — `manus-1.6` / `manus-1.6-lite` / `manus-1.6-max`. Bu, Manus v2
  OpenAPI şemasındaki **tek** resmî model/sürüm parametresidir (`task.create` gövdesi). Ayarlardan seçilir.
- **Belirli görsel modeli (Nano Banana Pro / GPT Image) seçimi KALDIRILDI** — Manus v2 API'sinde böyle
  bir parametre yok; `task.create` yalnızca `agent_profile` alır, hangi görsel modelinin kullanılacağına
  ajan kendi karar verir.
- **Kimlik doğrulama:** anahtar önce `x-manus-api-key` (doğrudan API anahtarı), başarısızsa
  `Authorization: Bearer` (OAuth token) olarak denenir; hangisi çalıştıysa hatırlanır. "API'yi doğrula"
  hangi modun geçtiğini gösterir. Anahtar geçersizse net hata verir (manus.im → Settings → API keys).

## Ayarlar sayfası

Dört bölüm: **OneBound**, **Claude (Anthropic)**, **Manus**, **Shopify**. Her biri için maskeli anahtar
ipucu + kaynak (`.env` / bu sayfa / yok) + anahtar giriş kutusu. Bu sayfadan girilen anahtar
veritabanına yazılır ve `.env`'in önüne geçer (`ONEBOUND_KEY` gibi `ANTHROPIC_API_KEY` ve
`MANUS_API_KEY` de artık buradan girilebilir). "API'yi doğrula" butonları canlı bağlantı testi + yukarıda
anlatılan model listesi / parametre kanıtı gösterir.

## Görsel çevirisi (Manus)

- **Seçilebilir + toplu**: 2. adımda görselleri Ctrl+tık ile seç → "Seçili görselleri çevir", ya da "Tümünü çevir".
- **Varsayılan davranış**: kaynak Çince → hedef dil (öntanımlı İngilizce). Ajan **önce ürünü ve nişini tanır**, sonra
  yalnızca **görsel üzerine eklenmiş** Çince yazıları doğru terminolojiyle çevirir (keycap sözlüğü gömülü:
  `原厂高度` → *Cherry profile*, `热升华` → *dye-sublimation*, …). Ürünün fiziksel üstündeki Çince, arka plan, ışık,
  kompozisyon **korunur**.
- **Çeviri gerekmezse**: ajan `NO_CHANGE_NEEDED` döner, yeni görsel üretilmez. "Çeviriye gerek yok" düğmesi ile
  hiç başlatmadan atlanabilir.
- **İptal**: her uzun işlem için ilerleme çubuğu + adım listesi + "İptal et" (Manus tarafında `task.stop` de çağrılır).

## Detaylı alt metinler (Manus)

2. adımda **"Manus ile detaylı alt text"** — Manus görseli görerek her biri için tek cümlelik, ≤480 karakter alt metin
yazar: konu, **kamera açısı / bakış** (önden, 3/4, tepeden / flat-lay, yakın makro, elde), **kadraj ve konum**, arka
plan/yüzey, ışık, baskın renkler, malzeme/finiş ve görünen yazı/prop/ölçek. Seçili görseller varsa onlara, yoksa
kullanılmayanlar hariç hepsine. **"Claude ile alt text"** hızlı/kısa alternatif. Alt metinler galeri, Shopify açıklama
görselleri (`<img alt>`) ve Etsy `photos.csv` alt sütununda kullanılır.

## Etsy vs Shopify kuralları

Etsy'nin 2026 kuralları uygulamaya gömülü:

| | Shopify | Etsy |
|---|---|---|
| Açıklama | HTML; açıklama görselleri `body_html` içine `<img alt>` olarak gömülür (düz / alt-metinli düzen) | **DÜZ METİN** — HTML, markdown, biçim, görsel yok. Model çıktısı sunucuda da temizlenir. Kısa paragraflar. |
| Başlık | 35–50 kr · başlık = handle = SEO başlığı = SEO açıklaması | **100–120 kr**, sabit yapı (aşağıda), aynı kelime 2 kez geçemez |
| Fotoğraflar | ürün kartı fotoğrafları (gallery + variant); açıklama görselleri gövdede | gallery + variant + description, **maks 20 hazırlanır**, her birine **≤500 kr alt metin** (`photos.csv`) |
| Etiketler | serbest | **maks 13**, her biri **≤20 kr** |
| Düzen seçeneği | var (düz / alt-metinli) | yok (düz metin) |

**Etsy başlık yapısı** (varsayılan):
`[ilk 40 kr: en önemli kelimeler + ürünün tam adı — ilk 40 ürünle biter] | [1. adın varyantı, 40–70 arası biter], [diğer öbekler…] – Marka®`
Örnek: `One Piece Theme Anime Artisan Keycap Set | Pirate Adventure Keycaps, MOA & Cherry Profile, PBT Dye-Sub – KeyArtisan®`
Sunucu 120 karakteri aşarsa öbek sınırından kırpar.

Önizleme, CSV/ZIP çıktıları ve Shopify push'un hepsi kanala göre davranır. Etsy ZIP'inde bir `README.txt` limitleri
hatırlatır. Kaynak: [Etsy açıklama kuralları](https://help.etsy.com/hc/en-gb/articles/4406604492823).

## Görsel alanları — otomatik doldurma + toplu düzenleme

- 2. adımda **Ana galeri / Varyant görselleri / Açıklama görselleri** artık otomatik dolar
  (`normalize.ts`: `pic_url`+`item_imgs` → gallery, `prop_imgs`+sku görselleri → variant, açıklama
  HTML'indeki `<img>` → description). Manuel seçim gerekmiyor; "Kullanılmayan" başlangıçta boş.
- Her alan başlığında **"alanı seç"** onay kutusu (o alandaki tüm görselleri seçer) ve **"Alanı toplu
  düzenle"** butonu.
- **Toplu düzenleyici** (`BulkEditPanel`): kadraj şablonu + parlaklık/kontrast/doygunluk + filigran +
  logo (yükle, 9 yön, yükseklik/boşluk @1000px, saydamlık) + format/kalite. İlk görselin canlı
  önizlemesi. İki işlem: **Tümünü indir (ZIP)** ve **Taslağa uygula** (düzenlenmiş kopyaları seçilen
  alana ekler). İlerleme çubuğu var.

## Görsel düzenleyici (Canva-lite)

Bir görsele çift tıkla ya da "Gelişmiş düzenleyici": parlaklık/kontrast/doygunluk/bulanıklık, **20 font**, tüm renkler +
gradyan + kontur, sürükle-konumlandır metin, silme fırçası (**Üretken AI** / düz renk), **logo** (yükle / kayıtlı, 9
yönlü hizalama, varsayılan orta-alt 12px yükseklik + 2px boşluk @1000px referans — görsel boyutu değişse de oran sabit),
hazır ayarlar, format (PNG/JPG/WebP) + kalite + en-uzun-kenar. "İndir" veya "Taslağa uygula".

### Üretken silme (inpainting) — %100 yerel, ücretsiz

Windows Fotoğraflar'daki "Üretken Silme" gibi ama **tamamen tarayıcıda** çalışır: internet, API anahtarı, kredi yok.
Silme aracında üç mod:
- **Fırça** — silinecek alanı boya (pembe = maske).
- **Tek tık seç** — bir yazıya / nesneye tıkla; benzer renkteki bağlı bölge otomatik seçilir (renk toleransı ayarlanır).
- **Maskeyi sil** — yanlış maskelenen yeri geri al.

Sonra **"Sil"e** bas. Pipeline (`src/lib/inpaint.worker.ts`, ayrı Web Worker):
1. Maske 2px genişletilir (anti-alias kenarları kapsar).
2. **Fast Marching (Telea)** — maske kenarlardan içeri, görüntü gradyanlarını izleyerek doldurulur.
3. **SOR harmonik gevşeme** — maske içinde Laplace çözülür; düz/gradyanlı arka planları birebir geri getirir.
4. **Doku aktarımı** — en iyi eşleşen yakın bölgeden gerçek yüksek-frekans doku kopyalanır (yalnızca eşleşme gerçekten iyiyse; değilse temiz harmonik sonuç kalır).
5. **Kenar yumuşatma** — maske ucunda %35 orijinale karışım, dikiş izi olmaz.
6. **Gren** varsayılan **%4** (neredeyse yok; 0–40 arası).

Maske dışı pikseller **byte-byte** değişmez. Düz stüdyo arka planında ortalama hata **~1/255**, 500×500'de ~100 ms.

**Aynı bölgeyi birden fazla görselde temizle:** 2. adımda 2+ görsel seç → "Aynı bölgeyi temizle" → maskeyi bir kez çiz →
"N görselde sil". Aynı % maske hepsine uygulanır, sonuçlar yerinde değiştirilir.

### Geri / ileri al

Düzenleyicideki **her işlem** (ayar, metin, logo, maske, silme) geri alınabilir: başlıktaki **↶ ↷** düğmeleri veya
**Ctrl+Z / Ctrl+Y** (Ctrl+Shift+Z de olur). 40 adımlık geçmiş.

## Maliyet

Her ürün için Claude token maliyeti (yanıttan) + Manus kredi maliyeti (görev öncesi/sonrası bakiye farkı) ayrı ayrı ve
ürün başına Maliyet paneli'nde toplanır.

## Görsel kalıcılığı

Manus çeviri sonuçları 48 saatte silinir; iş biter bitmez sunucu bunları indirip `data/media/` altına yazar ve
`/api/media/…` yolundan servis eder. Düzenleyiciden "Taslağa uygula" ile eklenen görseller de aynı yere yazılır (base64
veritabanına gömülmez).

## Taobao / 1688 normalleştirme

`server/normalize.ts` her iki platformun OneBound yanıt varyantlarını tolere eder: `title/subject`, `pic_url/mainImage`,
`skus.sku` / `sku` / `price_range` tiered fiyat, `props/props_list/item_params/productFeatureList`, protokolsüz URL'ler,
`num_iid/offerId`, video. Eksik alanlarda güvenli varsayılanlara düşer; hiç görsel/varyant yoksa çökmez.

Anahtarlar istemciye hiçbir zaman gönderilmez; yalnızca maskeli görünür. OneBound çağrıları sabit endpoint
izin listesiyle sınırlıdır. Ürün görselleri, tarayıcı canvas'ı pikselleri okuyabilsin diye kendi
`/api/image-proxy` ucumuz üzerinden geçirilir (yalnızca alicdn/taobao/1688/jd host'ları).

## Mimari

```
server/            Express + node:sqlite (bağımlılıksız)
  onebound.ts      OneBound proxy + num_iid ayıklama + endpoint allow-list
  normalize.ts     OneBound item JSON -> NormalisedProduct
  llm.ts           Anthropic SDK sarmalayıcı (üretim/çeviri/alt metin) + maliyet
  shopify.ts       Admin API taslak ürün oluşturma (opsiyonel)
  drafts.ts        Taslak + sürüm (ürün başına dal)
shared/types.ts    Sunucu/istemci sözleşmesi
src/               Vite + React
  components/       ApiExplorer, VisualWorkspace, DeliveryStudio, ListingPreview, Stepper
  lib/image.ts      canvas kadraj/filigran/PNG
  lib/export.ts     Shopify/Woo CSV, Etsy ZIP, JSON
```

## Notlar

- `data/app.sqlite` yereldir ve gitignore'dadır.
- `npm test` — endpoint allow-list bütünlük testi.
- Bu proje kardeş `Etsy Shop Console` projesinden bağımsızdır; ayrı klasör, ayrı bağımlılıklar.
