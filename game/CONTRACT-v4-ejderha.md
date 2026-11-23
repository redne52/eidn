# Edin v4 — Ejderha, ruh özü emme, kaynak, kamp (müdür sözleşmesi)

Kaynak talimat: /mnt/user-data/uploads/f933e285-attachment.txt (kullanıcı onayı: "yapalım"). Kurallar: oyunu sıfırdan yazma; v2 savaş matematiği aynı; yeni sayılar rules.json'da; src/core'da DOM/Three yok; eski kayıtlar açılır; Türkçe; sahte varlık/sahte test yok.

## Sıra
Tur 1 (paralel): Ekip A = ejderha modelleri + animasyonlar (models.js). Ekip B = çekirdek veri + kayıt geçişi (rules.json, world.js, save.js) — Aşama 1 çekirdeği.
Tur 2: Ekip C = arayüz: ejderha seçimi, ruh özü emme efekti (Aşama 1+2 arayüz) + doğrulama.
Tur 3: Aşama 3+4 (kaynak toplama, kamp, yemek) çekirdek + arayüz.
Tur 4: Test, performans, paketleme (TESLIM-v4.md).

## Ejderhalar (müdür kararı)
Kimlikler ve rol eşlemesi — savaş sayıları ve zincir yapıları eski rolden AYNEN alınır (denge korunur), adlar/temalar değişir:
| id | Ad | Rol (eski kaynak) | Renk |
|---|---|---|---|
| ejder_ates | Ateş Ejderhası | hasar (ugallu) | kırmızı/siyah pul |
| ejder_su | Su Ejderhası | iyileştirme/dayanıklılık (kulullu) | mavi/turkuaz |
| ejder_zehir | Zehir Ejderhası | zehir/DoT (girtablullu) | yeşil/koyu mor |
| ejder_tas | Taş Ejderhası | savunma/karşı saldırı (kusarikku) | bronz/kaya |
Zincir ve bitirici ADLARI ejderha temasına göre Türkçe yeniden adlandırılır (sayılar aynı). Yanık durumu varsa ateş ejderinin görsel teması; yeni hasar formülü yok.
Eski ugallu/girtablullu/kulullu/kusarikku: rules.json'da kalır → `legacy: true`, oynanabilir listeden çıkar; yabani düşman olarak (zaten var) ve `collection` verisi olarak yaşar.

## Kayıt geçişi
save sürümü artırılır (ör. `v: 2`). Yükleme sırasında: creature.id eski → yeni (ugallu→ejder_ates, kulullu→ejder_su, girtablullu→ejder_zehir, kusarikku→ejder_tas); seviye, derece, öz, can korunur; `creature.legacyId` saklanır; yumurtalardaki id'ler aynı eşlemeyle; yeni alanlar güvenli varsayılanla. Geçiş idempotent (iki kez yüklemek bozmaz). Belgelenir (NOTES-gecis.md).

## Model API ek (Ekip A)
getModel(ejderId, stage) — 1/5/10 evre. Mevcut anim API'nin tamamı + yeniler:
- `absorb(targetWorldPos, durSec) -> Promise` baş hedefe döner, ağız açılır, emme duruşu; bitince göz/boğaz/pul parıltısı (meta.glowMats ile).
- `eat(durSec)`, `rest(on)`, `gather(durSec)` (kamp/toplama için; Tur 3'te kullanılacak).
- `meta.mouth` (yerel Vector3, ağız ucu), `meta.chest` (yerel Vector3), `meta.glow(k)` 0..1 parıltı ayarı.
- Yürüme: 4 bacaklı yürüyüş + kuyruk dalgası; dönüşte boyun önden döner. Kanatlar katlı, savaş/zaferde açılır.
Çizim çağrısı ≤ 6, üçgen ≤ rules.performance.

## Ruh özü emme (Tur 2)
Ödül çekirdekte (finishFight) tek kez hesaplanır; animasyon sadece görsel, atlanabilir/hızlandırılabilir; kesilirse ödül değişmez. Süreler rules.json > absorbFx: normal ~1 sn, nadir ~2 sn, bekçi ~3–4 sn. "Nadir" tanımı rules.json'da (ör. canavar tipinde `rare: true` veya bölge üst seviyesinin üstü).
