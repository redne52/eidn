# EDİN — kaynak kod (README / BENİ OKU)

Tarayıcıda çalışan Three.js prototipi (Godot değil). Tek kişilik; mobil yatay ekran.

## Önce bunları oku (dosya yolları zip'in köküne göredir)
1. `game/CONTRACT.md` — modüllerin görevleri ve API sözleşmesi
2. `game/CONTRACT-v2-savas.md` — güncel savaş sistemi (zincir kombo, Kan Ateşi puanı, bitirici, telgraf/karşı saldırı). Bölge seçimi KALDIRILDI.
3. `game/src/data/rules.json` — bütün sayılar (yaratıklar, canavarlar, bölgeler, formüller). Tek doğruluk kaynağı.
4. `game/NOTES-savas.md`, `game/NOTES-dunya.md` — programcı notları

## Klasörler
- `game/src/core/` — oyun mantığı, DOM yok: `combat.js` (savaş), `world.js` (harita, öz, yumurta, dükkân), `save.js` (kayıt), `rng.js`
- `game/src/ui/` — Three.js görsel katman: `models.js` (yaratık modelleri, `getModel(id, stage)`), `worldView.js`, `battleView.js`, `screens.js`, `env/` (harita dokuları, yapılar, efektler)
- `game/src/main.js` — her şeyi bağlar
- `game/test/` — testler; `game/tools/` — denge simülasyonları
- `docs/meshy_prompts.md` — Meshy / Hy 3D model üretim talimatları
- `sim/` — ilk denge simülasyonu (Python)

## Çalıştırma
```
cd game
npm install
npm test
npm run build   # → game/dist/index.html (tek dosya oyun)
```

## Kurallar
- Sayıları koda gömme; `rules.json`'dan oku.
- `src/core` içinde DOM kullanma.
- Değişiklikten sonra `npm test` geçmeli.
