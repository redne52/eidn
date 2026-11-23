# EDİN v4.1 — Teslim raporu: Ruh Çekirdeği ve karakter kazanma

Plan: game/PLAN-v4.1-cekirdek.md (bölüm 13 = kullanıcının son düzeltmeleri). v2 savaş matematiği, Three.js mimarisi, Türkçe arayüz ve eski kayıt uyumu korundu.

## Kurallar (rules.json > soulCores, rules-v4.1)
- 4 çekirdek: Kil, Lacivert, Altın, Kader.
- Düşme: nadir canavar Kıyı/Bozkır %45 Kil, Derin %20 Lacivert · Laḫmu 1 Kil + %20 Lacivert · Anzû ilk zafer 2 Altın, sonra 1 Altın + 1 Lacivert + %50 Altın + %15 Kader · Ušumgallu ilk zafer 1 Kader, sonra 1 Altın + %15 Kader. Sıradan canavar: çekirdek yok (öz ve yutma aynen).
- Mitolojik olasılık (Aday A, kullanıcı onayı): Kil %0 · Lacivert %0,5 · Altın %1,5 · Kader %4. Merhamet: 40'tan sonra +%0,5/açılış, 80'de garanti; aktif karakter seviye < 8 iken mitolojik çıkmaz ve sayaç ilerlemez.
- Derece: Kil C70/B25/A4,5/S0,5 · Lacivert 50/35/12/3 · Altın 30/45/20/5 · Kader B50/A38/S12 · mitolojik B50/A35/S15. 10'lu açılışta en az 1 B+.
- Mitolojikler (Ugallu, Girtablullu, Kulullu, Kusarikku) ek güç almaz; karşılık gelen rolün sayılarını kullanır.
- Kadro en fazla 2; aktif yalnız Ruh Kapısı'nda değişir; aktif karakter doğrudan silinemez; değiştirme çift onaylı ve bedelsiz.
- Yeni karakter: kadrodaki en yüksek seviyenin %70'inden (aşağı yuvarlanır) başlar.
- Yedirme: C 15 · B 30 · A 60 · S 120 · mitolojik 250 öz; sahada taşınan öze, kapıda güvendeki öze.
- Çanta 20 → 30/40/50 (300/700/1500 şekel), depo 300, varışta otomatik depoya aktarma.
- Ölüm: yalnız çantadaki çekirdekler; Kıyı %0 · Bozkır %20 · Derin %40; olasılıklı yuvarlama, eşit rastgele seçim; depo ve bekleyen sonuçlar korunur; ilk 3 sefer kayıpsız.
- Açılış: savaş dışında her yerde (sahada yalnız çantadan). Sonuç animasyondan önce kaydedilir; saldırı gelirse animasyon kesilir, sonuç bekler.
- Çekirdek satışı ve doğrudan öze çevirme: ertelendi.

## Simülasyon özeti (N=200, gerçek world+combat)
| Aday / başlangıç | 1→13 medyan | 13'te ≥1 mitolojik | İlk mitolojik medyan | 4 mitolojik medyan |
|---|---|---|---|---|
| A, %70 başlangıç (SEÇİLEN) | 5,4 sa (her iyiye geçen) · 4,8 sa (yalnız A/S/mit.) · 3,7 sa (geçmeyen) | %13,5–15,5 | 8,7 sa | 36 sa |
| B, %70 başlangıç | 5,25 sa | %8 | 11,7 sa | 59 sa |
Not: İki aday da önceden belirlenen ölçütün (13'te %25–45; ilk mitolojik 4–8 sa) altında kaldı; kullanıcı A'da kalmayı seçti. Yedirme özü toplam seviye özünün %2,5–3,7'si (tavan %8). Yeni karakterin eski seviyeye dönüşü: %70 başlangıçla 42 dk (seviye 1 ile 51 dk).

## Kayıt geçişi (save v3; v1 → v2 → v3, idempotent) — ayrıntı game/NOTES-gecis.md
- Mevcut yaratık → kadronun ilk ve aktif karakteri.
- Eski yumurtalar derece ve kuluçka ilerlemesiyle korunur; çatlayınca derece korunarak karar ekranına gelir.
- Kader puanı: her 10 = 1 Kader Mührü (A %80 / S %20), kalan ×2 merhamete (23 puan → 2 mühür + 6).

## Test sonuçları
- npm test: combat, world (18), edge, cam, migrate (9), resources (12), cores (23), dissolve, ui — hepsi geçti.
- npm run build: game/dist/index.html, 953 KB.
- Tarayıcı, telefon taklidi + gerçek dokunma, 800×360 ve 915×412 (konsol hatası yok): çekirdek düşmesi ve çanta · otomatik depo · Bozkır'da ölüm ve çekirdek kaybı · kapıda 1'li açılış ve tut · 10'lu açılış, Atla, B+ garantisi · Hepsini yedir (girdap) · aktif karakter engeli ve çift onaylı değiştirme · Kan Bağları'nda aktif geçiş · açılış ortasında yenileme (çekirdek tek düşer, sonuç bekler) · eski kayıt (mühür, yumurta) · Kader Mührü kullanımı · sahada açılış ve yedirme (taşınan öze) · sahada açılış sırasında saldırı (güvenli kesilme, sonuç bekler) · yedek çözülme efekti · 3 grafik ayarı.
- Gerçek telefonda TEST EDİLMEDİ.

## Değişen / yeni dosyalar
Çekirdek: src/core/cores.js (yeni), world.js, migrate.js, save.js, src/data/rules.json
Arayüz: src/ui/coreScreens.js, crystal.js, spiritFeed.js, coreFx.js, dissolve.js (yeni); main.js, screens.js, battleView.js, worldView.js, soulFx.js, stage.js, style.css
Testler/araçlar: test/cores.test.mjs, test/dissolve.test.mjs (yeni), migrate/world testleri; tools/cores_sim.mjs; uitools/v41_core_flow.py
Belgeler: PLAN-v4.1-cekirdek.md, NOTES-cekirdek.md, NOTES-gecis.md

## Bilinen eksikler
- Mitolojik oranlar ölçütten nadir (bilinçli karar).
- Her daha iyi karaktere geçen oyuncuda 1→13 ~5,4 saat (3–5 hedefinin üstü; oyuncu tercihi).
- Kader çekirdeği 13'te ortalama ~1,5 (Ušumgallu son bekçi).
- 10'lu yedirmede hayaletler kısmen üst üste binebiliyor.
- Modeller kodla üretilmiş; gerçek GLB yok (altyapı hazır).
