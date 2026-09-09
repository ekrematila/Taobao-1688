import { useI18n } from "../i18n";

type Section = { h: string; body: string[] };

const TR: Section[] = [
  {
    h: "Akış",
    body: [
      "1) Taobao / 1688 API — ürün ID’si veya bağlantısı ile veriyi çek. Bir taslak oluşur; ID bir daha sorulmaz.",
      "2) Görsel çalışma alanı — görselleri hazırla (aşağıdaki sıra).",
      "3) İçerik ve teslim — Shopify / Etsy listelemesi üret, düzenle, dışa aktar.",
    ],
  },
  {
    h: "Görsel hazırlama sırası",
    body: [
      "a) Yazı / alan sil — görsel düzenleyicide “Alan → yazı algıla” ya da fırça ile Çince yazıları temizle (tamamen yerel, ücretsiz).",
      "b) Çeviri (AI) — Manus ile görsel üzerindeki yazıları hedef dile çevir. Ürüne ve arka plana dokunmaz. Çeviri gerekmiyorsa “Çeviriye gerek yok”.",
      "c) Logo ekle — düzenleyicide logo; varsayılan orta-alt, 12px yükseklik, 2px boşluk (1000px referans). Görsel boyutundan bağımsız sabit kalır.",
      "d) Alt metin — çeviriden sonra yaz. Manus önerilir: görseli inceleyip açı, kadraj, konum, arka plan, ışık ve malzemeyi anlatır.",
      "Düzenlenen her görsel eskisinin yerine geçer. Rozet: Ç=Çeviri, S=Silme, E=Düzenleme, L=Logo, F=Format.",
    ],
  },
  {
    h: "Seçim & kısayollar",
    body: [
      "Ctrl + tık: çoklu seçim · Ctrl + Shift + tık: aralık seçimi · alan başlığındaki kutu: alanı seç.",
      "Görsel üstünde ×: tek kaldır · Delete / Backspace: seçilenleri kaldır (önce onay). Kaldırma tamdır; geri almak için Sürümler.",
      "g ardından 1–5: sayfalar arası geçiş. Çift tık: gelişmiş düzenleyici.",
    ],
  },
  {
    h: "Etsy kuralları",
    body: [
      "Açıklama düz metin — HTML, markdown veya görsel yok. Açıklama görselleri yalnızca Shopify içindir.",
      "Başlık 100–120 karakter; aynı kelime iki kez geçmez; ilk 40 karakter en önemli anahtarlar + ürünün tam adı ile biter; sonra “ | ” + 2. anahtar (40–70 arası) + virgül; en sonda marka “ – Marka®”. “gift” kelimesi kullanılmaz.",
      "Etiketler: Shopify’da en az 40 ürünle alakalı etiket; Etsy’de 20 aday üretilir, 13’ü canlı seçilir. Sayı+adet parçası (“138 key keycap set” gibi) kullanılmaz.",
      "Fotoğraflar ayrı alan; 20’ye kadar hazırlanır (Etsy canlı sınırı ~10), her birinin alt metni ≤ 500 karakter.",
    ],
  },
  {
    h: "Shopify kuralları",
    body: [
      "Başlık 35–50 karakter = URL handle = SEO başlık = SEO açıklama (ayrı SEO açıklaması yok).",
      "HTML açıklama gövdeye gömülür; açıklama görselleri body_html içinde figürlerle yer alır.",
    ],
  },
  {
    h: "Maliyet",
    body: [
      "Claude: yanıt token kullanımından hesaplanır (önbellek okuma ×0.1, önbellek yazma ×1.25).",
      "Manus: görev öncesi/sonrası kredi bakiyesi farkından; okunamazsa “tahmini” işaretlenir. Kredi→USD oranı Ayarlar’dan.",
      "Tarayıcıda çalışan işlemler ücretsizdir: kadraj, logo, filigran, alan temizleme, format çevirme, PNG/ZIP indirme.",
    ],
  },
];

const EN: Section[] = [
  {
    h: "Pipeline",
    body: [
      "1) Taobao / 1688 API — fetch by product ID or link. A draft is created; the ID is never asked again.",
      "2) Visual workspace — prepare images (order below).",
      "3) Content & delivery — generate, edit and export the Shopify / Etsy listing.",
    ],
  },
  {
    h: "Image prep order",
    body: [
      "a) Erase text / area — in the editor use “Area → detect text” or the brush to clear Chinese text (fully local, free).",
      "b) Translate (AI) — Manus translates on-image text to the target language, leaving the product and background untouched. Use “No translation needed” to skip.",
      "c) Add logo — default bottom-center, 12px height, 2px offset (1000px reference); stays fixed regardless of image size.",
      "d) Alt text — write it after translation. Manus recommended: it describes angle, framing, position, background, lighting and materials.",
      "Every edited image replaces the old one. Badges: Ç=Translate, S=Erase, E=Edit, L=Logo, F=Format.",
    ],
  },
  {
    h: "Selection & shortcuts",
    body: [
      "Ctrl + click: multi-select · Ctrl + Shift + click: range · zone header checkbox: select the zone.",
      "× on an image: remove one · Delete / Backspace: remove selected (with confirm). Removal is permanent; use Revisions to undo.",
      "g then 1–5: switch pages. Double-click: advanced editor.",
    ],
  },
  {
    h: "Etsy rules",
    body: [
      "Description is plain text — no HTML, markdown or images. Description images are Shopify-only.",
      "Title 100–120 chars; no word twice; first 40 chars end on the product’s exact name; then “ | ” + 2nd keyword (between 40–70) + comma; brand last as “ – Brand®”. Never use “gift”.",
      "Tags: Shopify at least 40 product-relevant tags; Etsy generates 20 candidates, 13 go live. No number+unit fragments like \"138 key keycap set\".",
      "Photos are a separate field; up to 20 prepared (Etsy live cap ~10), each alt ≤ 500 chars.",
    ],
  },
  {
    h: "Shopify rules",
    body: [
      "Title 35–50 chars = URL handle = SEO title = SEO description (no separate SEO description).",
      "HTML description embeds into the body; description images sit in body_html as figures.",
    ],
  },
  {
    h: "Cost",
    body: [
      "Claude: from returned token usage (cache read ×0.1, cache write ×1.25).",
      "Manus: from the credit-balance delta around the task; marked “estimated” if unreadable. Credit→USD rate in Settings.",
      "Browser-side operations are free: crop, logo, watermark, area erase, format convert, PNG/ZIP download.",
    ],
  },
];

export default function Guide({ onClose }: { onClose: () => void }) {
  const { lang } = useI18n();
  const sections = lang === "tr" ? TR : EN;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(720px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="m-h">
          <h3 style={{ fontSize: 14 }}>{lang === "tr" ? "Kullanım kılavuzu" : "User guide"}</h3>
          <div className="grow" style={{ flex: 1 }} />
          <button className="btn ghost sm" onClick={onClose}>
            {lang === "tr" ? "Kapat" : "Close"}
          </button>
        </div>
        <div className="m-b col" style={{ gap: 14 }}>
          {sections.map((s) => (
            <div key={s.h} className="col" style={{ gap: 5 }}>
              <b style={{ fontSize: 12.5 }}>{s.h}</b>
              {s.body.map((line, i) => (
                <p key={i} className="tiny muted" style={{ lineHeight: 1.55 }}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
