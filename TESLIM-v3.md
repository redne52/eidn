# EDİN v3 — Teslim raporu (görsel geliştirme)

Talimat: "EDİN — Three.js profesyonel geliştirme talimatı". Savaş matematiği, rules.json, kayıt biçimi ve src/core değişmedi.

## Test sonuçları
- `npm test`: combat, world (18 test), edge, ui — hepsi geçti.
- `npm run build`: game/dist/index.html, 805 KB, tek dosya.
- Tarayıcı akışı (yazılımsal grafik, 800×360 ve 915×412, sayfa hatası yok): seçim → Kıyı → kombo → bitirici → zafer → özü kapıya taşıma → kaydet/yükle → Bozkır geçişi → yenilgi; 3 grafik ayarı; azaltılmış efekt.
- Gerçek telefonda kare hızı ÖLÇÜLMEDİ.

## Değişen / yeni dosyalar
Yaratıklar ve animasyon (Ekip A):
- src/ui/models.js (yeniden yazıldı), src/ui/models/skin.js (yeni), src/ui/glb.js (yeni), src/ui/assets.json (yeni, boş), src/ui/galleryView.js, test/ui.test.mjs, tools/modelstats.mjs, uitools/v3_models.py
Savaş efektleri, harita, performans (Ekip B):
- src/ui/battleFx.js (yeni), src/ui/battleView.js, src/ui/stage.js, src/ui/style.css, src/ui/screens.js, src/main.js, src/ui/worldView.js, src/ui/env/zones.js, src/ui/env/structures.js, src/ui/env/fx.js, src/ui/env/textures.js, uitools/v3_battle.py, uitools/v3_flow.py
Sözleşme: game/CONTRACT-v3-gorsel.md

## Görsel geliştirmeler
- Yaratıklar: Ugallu, Girtablullu, Kulullu, Kusarikku yeni silüet ve kodla üretilmiş dokular; 1/5/10. evrede silüet değişiyor. Model başına 4 çizim çağrısı (önce 26–38).
- Animasyon: hızlı, ağır, savunma, hasar, kaçınma, ölüm, zafer, yaratığa özel bitirici; temas anı hasarla eşzamanlı.
- GLB altyapısı: Meshy modelleri için hazır; gerçek GLB yok, hata olursa kod modeline düşüyor.
- Savaş: hamleye özel efektler, yaratığa özel bitirici efektleri (fırtına/zehir/su/boynuz-kalkan), sinematik bitirici kamerası, "Azaltılmış efekt" ayarı; yazı çakışması ve puan sayacı hataları düzeltildi.
- Harita: Ruh Kapısı tören yolu ve kanatlı boğa koruyucular; Kıyı sulama kanalları ve patikalar; Bozkır erozyon kayalıkları, kuru nehir yatağı, uzak kuleler, Anzû izleri; Derin Edin düzensiz enerji çatlakları, ilksel deniz, çökmüş tapınaklar.
- Grafik ayarları gerçek fark yaratıyor (doku 128/256/512, parçacık, ot, dekor, uzak görüş).

## Bilinen eksikler
- Modeller hâlâ stilize/kod üretimi; gerçek kalite Meshy GLB ile gelecek.
- Yüksek ayarda 82–94 bin, Orta'da Kıyı 68 bin üçgen: bütçe (60 bin) aşılıyor.
- Bitirici turu 2,3–3,5 sn (hedef 2,4 sn).
- Canavar bitiricileri çoğunlukla fırtına efekti kullanıyor.
- Bozkır zemini fırtına ışığında grimsi; Derin Edin uzak tapınağı blok görünüyor.
- uitools/int_shots.py v1 savaş ekranına göre, artık çalışmıyor (yerine v3_flow.py).

## Önce / sonra görüntüleri
shots/ klasöründe: önce env_*, v2_*, gallery.png — sonra v3_*.
