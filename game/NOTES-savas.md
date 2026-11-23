# NOTES — Savaş programcısı

## Dosyalar
- `src/core/rng.js` — tohumlanabilir RNG (mulberry32): next, int, pick, chance, range
- `src/core/combat.js` — sözleşmedeki imzalar + ekler: `enemyChoose`, `smartPolicy`, `setRules/getRules` (sadece test), `STATUS_NAMES` (Türkçe durum adları), `critChance/blockChance/dodgeChance/baseDamage`
- `test/combat.test.mjs` — `node test/combat.test.mjs` (SIM_N ile savaş sayısı değişir)

## rules.json değişiklikleri (src/data ve ../data aynı)
- Kusarikku growth: atk 3.4 → 3.8, def 3.0 → 2.4 (seviye 1 değerleri aynı).
  Sonuç: 13. sv S vs C %91–92 → %88; Kusarikku vs Ugallu %51 → %48–56; Anzu'ya karşı %36 → %41.

## rules.json'da olmayıp benim karar verdiğim kurallar (müdür onayı)
- Kaçış şansı: oyuncu çevikliği / (oyuncu + düşman), %25–%75 arası; bekçiden %25. Kaçış başarısızsa düşman yine vurur.
- Kemer eşyası ve kaçış oyuncunun o turdaki eylemidir (vuruş yapılmaz).
- Savunma duruşu: vuruş yine yapılır (×0.5 verir, ×0.6 alır).
- Canavar durum etkisi değeri: 0.30 × canavarın o anki saldırısı, 2 tur.
- Bandaj iyileşmesi tur sonunda işler (ilk tik aynı tur).
- Yorgunluk: 15. turdan itibaren hasar ve DoT ×(1 + 0.05 × (tur − 14)), iyileşmeler ×0.5.
- Pasif yetenek 1. seviyeden açık (simülasyonla aynı); aktif 5. seviye, ikinci aktif A/S + 13. seviye.
- İkisi aynı turda ölürse oyuncu kaybeder.

## Açık denge konuları (benim yetkim dışında)
- S vs C: Ugallu %70 (hedef altı), Kulullu %94 (hedef üstü). Kulullu ayna maçları ~24 tur sürüyor.
- Bekçiler eşyasız ve rastgele koruma ile zor: Anzu %33–47, Ušumgallu %32–43. Kemerle oynayan oyuncuda daha yüksek olur; test sorumlusu kemerli politikayla ölçmeli.
- rules.json adları ASCII (Firtina pencesi vb.) — arayüz Türkçe karakterli ad isterse ayrı bir ad tablosu gerekir.

## v2 (kombo) — 2026-11-18
- Bölge seçimi kaldırıldı (constants.zones/guardZones/headCritStunChance/guardedMult/defStance*, creatures.favZone, ai.favZone* silindi).
- Yeni: rules.combat2, creatures.*.chains (3 zincir, sv 1/5/10, 3. zincir minGrade A), creatures.*.finisher, canavar/bekçi finisher (ad).
- secondSkillLevel 10'a indi (world.js 'skillUnlocked second' artık 3. zincir).
- combat.js API: playTurn({action:'quick'|'heavy'|'guard'|'finisher'|'item'|'flee', itemId}), comboHints, autoChoice, smartPolicy, flatPolicy, unlockedChains, MOVE_NAMES.
- Dövüşçü alanları: points, history, guarding, telegraph ('heavy'|null, tur başında hazır), intent ('quick'|'heavy'|'finisher'|'stunned').
- Savunma zinciri bozmaz; yanlış saldırı hamlesi bozar (son ek eşleşmesi). Yaratık düşman (ayna) telgraf etmez.
- Düşman bitiricisi de 'heavy' telgrafıyla gelir; karşılanırsa {type:'finisher', countered:true}.
- Arayüz: eski battleView zone alanları gönderiyor; motor bilinmeyen alanları yok sayar ama action 'attack'/'skill'/'defend' artık geçersiz → 'quick'e düşer. Arayüzcünün yeni ekranı gerekli.
- Denge araçları: tools/sim2.mjs (rapor), tools/tune2.mjs (bekçi hp/atk ölçek arama), tools/policy.mjs (kemerli akıllı politika).
- Grade statMult: B 1.035, A 1.08, S 1.17 (S vs C %77–87). Kusarikku def/blok büyümesi ve pasif karşı vuruş 0.2'ye indi; Girtablullu zehir güçlendi; bekçi hp/atk modları yeniden ayarlandı.
- v2.1 düzeltme: bitirici/kemer/kaçış zinciri sıfırlar (playTurn başında). 1. zincirler 2 adım (Ugallu/Kulullu A-H, H-H-A, H-A-A; Girtablullu/Kusarikku H-A, A-A-H, A-H-H). chainExtraPoints 0. Telgraf: canavar %25, bekçi %12 (telegraphChanceGuardian), bekçi bitiricisi 5 puanda. Akıllı politika tek adımı kalan zinciri önce tamamlar; kemerli politika zincir ortasında bandaj/panzehir kullanmaz. monsterTemplate can ×1,45, saldırı ×0,85; bekçi modları yeniden ayarlandı.
