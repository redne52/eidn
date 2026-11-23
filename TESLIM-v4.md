# EDİN v4 — Teslim raporu (Ejderha, ruh özü emme, kaynak, kamp)

Talimat: "EDİN v4 — Ejderha, ruh özü ve hayatta kalma sistemi". v2 savaş matematiği değişmedi; yeni sayılar rules.json'da (rules-v4.x); src/core'da DOM/Three.js yok.

## Yeni oyun kuralları
### Ejderhalar (savaş sayıları eski rolden birebir)
| Ejderha | Rol (eski) | Zincirler | Bitirici |
|---|---|---|---|
| Ateş Ejderhası (ejder_ates) | hasar (Ugallu) | Kor Pençe · Alev Sağanağı · Ejder Kükremesi (A+) | Ateş Nefesi |
| Su Ejderhası (ejder_su) | iyileşme (Kulullu) | Apsû Pınarı · Gelgit Kanadı · Derin Dalga (A+) | Ea'nın Nefesi |
| Zehir Ejderhası (ejder_zehir) | zehir (Girtablullu) | Zehirli Diş · Boğucu Kuyruk · Zehir Aynası (A+) | Mor Sis Nefesi |
| Taş Ejderhası (ejder_tas) | savunma (Kusarikku) | Boynuz Çarpması · Taş Kalkan · Eşik Kayası (A+) | Dağ Darbesi |
Eski dört yaratık silinmedi: legacy, yabani düşman ve koleksiyon verisi.

### Ruh özü emme
Ödül çekirdekte tek kez hesaplanır ve kaydedilir; animasyon yalnızca görseldir. Süre: normal 1 sn, nadir (Uridimmu, Mušḫuššu) 2 sn, bekçi 3,5 sn. Dokununca ×4; ayarlarda Normal/Hızlı/Çok hızlı; azaltılmış efektte ×0,5.

### Kaynaklar
| Kaynak | Kıyı / Bozkır / Derin düğüm | Yeniden doğma |
|---|---|---|
| Çiğ et | 3 / 3 / 1 | 240 sn |
| Şifalı ot | 4 / 2 / 1 | 180 sn |
| Şifalı meyve (çiğ yenir, %15) | 3 / 1 / 0 | 200 sn |
| Ruh mantarı | 1 / 1 / 3 | 420 sn |
Toplama 1,2 sn; saldırı gelirse iptal (kaynak verilmez, düğüm kalır). Torba: kaynak 8×20, yemek 6×10.

### Kamp ve yemek
Her bölgede 1 kamp (kapıdan farklı yönde), 5 birim güvenli halka, sefer başına kamp başına en çok 4 pişirme. Kamp özü güvenceye ALMAZ.
| Tarif | Malzeme | Etki |
|---|---|---|
| Pişmiş et | 2 çiğ et | %30 can |
| Şifalı yahni | 1 çiğ et + 2 şifalı ot | %40 can |
| Ruhlu et | 2 çiğ et + 1 ruh mantarı | %25 can + sonraki 2 savaş saldırı +%10 |
Yemek savaş dışında yenir (1,5 sn), savaşta yenmez; hareket/saldırı yemeyi iptal eder, yemek harcanmaz; can max'ı aşmaz.

## Eski kayıt geçişi
Ayrıntı: game/NOTES-gecis.md. Kayıt sürümü 2. v1 (ve sürümsüz) kayıtlar açılışta otomatik geçer: ugallu→ejder_ates, kulullu→ejder_su, girtablullu→ejder_zehir, kusarikku→ejder_tas; seviye, derece, öz, can, şekel, kemer, yumurtalar korunur; eski kimlik legacyId'de saklanır; yeni alanlar boş varsayılanla eklenir; geçiş idempotent; oyuncuya bir kez bildirim gösterilir.

## Test sonuçları
- npm test: combat (denge: ejderhalar eski rollerle aynı tohumda birebir), world (18), edge, cam, migrate (9), resources/kamp (12), ui — hepsi geçti.
- npm run build: game/dist/index.html, ~883 KB.
- Tarayıcıda telefon taklidi + gerçek dokunma (CDP touch), 800×360 ve 915×412: talimattaki 20 maddenin hepsi geçti; konsol hatası yok.
- 1→13 oynanış simülasyonu: 3,2–3,9 saat; yemekle ölüm %29 daha az (74 / 104).
- Gerçek telefonda TEST EDİLMEDİ (görüntüler yazılımsal grafikle).

## Değişen / yeni dosyalar
Çekirdek: src/data/rules.json, src/core/world.js, save.js, combat.js, migrate.js (yeni)
Arayüz: src/ui/models.js, models/skin.js, soulFx.js (yeni), battleFx.js, battleView.js, worldView.js, screens.js, labels.js, style.css, galleryView.js, env/resources.js (yeni), env/zones.js, src/main.js
Testler/araçlar: test/migrate.test.mjs, test/resources.test.mjs (yeni), test/combat, world, edge, ui; tools/playthrough.mjs, sim2, tune2, balance; uitools/v4_dragons.py, v4_flow.py, v4_res_flow.py
Belgeler: CONTRACT-v4-ejderha.md, NOTES-gecis.md, NOTES-dunya.md

## Bilinen eksikler
- Gerçek GLB yok; ejderhalar kodla üretilmiş, stilize (pul dokusu yuvarlak gövdede bant gibi, katlı kanat çubuk gibi).
- Ateş nefesi efekti ekran görüntüsüyle doğrulanamadı (kod hatasız çalışıyor).
- Yüksek grafik ayarı ~97 bin üçgen (bütçe 60 bin).
- Toplama/yeme sırasında sayfa kapanırsa eylem kaybolur (hiçbir şey harcanmaz).
- Kaynak düğümleri ve kamp modelleri stilize.

## Sonraki sürüm için öneriler
1. Meshy'den 4 ejderha GLB'si (altyapı hazır: src/ui/glb.js, assets.json).
2. Ejderha yumurtaları ve ejderha yuvası; mitolojik koleksiyon ekranı (veri hazır: rules.collection).
3. Kampta "dinlen" (yavaş can yenileme, zamana bağlı) ve gece/gündüz.
4. Telefon üzerinde gerçek FPS ölçümü ve Yüksek ayarın bütçeye çekilmesi.
5. GitHub deposu + Codex ile ortak çalışma.
