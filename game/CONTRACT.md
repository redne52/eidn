# Edin v1 — Modül sözleşmesi (müdür)

Tek kaynak: `src/data/rules.json` (rules-v1.1). Sayıları koda gömme; hep rules.json'dan oku.
Kural kitabı: Claude Docs 9pdDfgj1NbcUwrsbu1FBNq. Müdür kararları: rules.json > directorDecisions.
Dil: oyundaki tüm yazılar Türkçe. Kod ES modülleri, sade JS (TypeScript yok).
Derleme: `npm run build` → esbuild `src/main.js` paketler → `dist/index.html` (tek dosya, JS gömülü, dış bağlantı yok).

## 1) src/core/rng.js (savaş programcısı yazar)
`createRng(seed) -> { next(): 0..1, int(a,b), pick(arr), chance(p) }`

## 2) src/core/combat.js — SAVAŞ PROGRAMCISI (DOM yok, saf mantık)
- `makeCombatant({ kind:'creature'|'monster'|'guardian', id, level, grade?, mods?, hp? }) -> Combatant`
  Combatant: `{ id, name, kind, level, grade, role, stats:{hp,atk,def,cev,krit,blok}, maxHp, hp, statuses:[], cooldowns:{}, skills:{active, active2?, passive} }`
- `startBattle(player, enemy, { rng, tutorial?:bool, belt:{itemId:count} }) -> Battle`
  Battle: `{ turn, player, enemy, belt, over:false, winner:null, log:[] }`
- `playTurn(battle, choice) -> Event[]`
  choice: `{ attackZone:'bas'|'govde'|'kanat'|'bacak', guardZone, action:'attack'|'skill'|'skill2'|'item'|'defend'|'flee', itemId? }`
  Düşman seçimini kendi yapar (rules.ai). Süre dolarsa arayüz `autoChoice(battle)` çağırır.
- `autoChoice(battle) -> choice` (süre dolunca / hızlı savaş yoksa rastgele)
- `canUse(battle, action, itemId?) -> bool`
- Event tipleri (arayüz bunları sırayla oynatır):
  `{type:'order', first:'player'|'enemy'}`
  `{type:'hit', by:'player'|'enemy', zone, result:'dodge'|'guarded'|'block'|'normal'|'crit', dmg, skill?:id}`
  `{type:'status', on:'player'|'enemy', status, turns}` · `{type:'dot', on, status, dmg}`
  `{type:'heal', on, amount, source}` · `{type:'stun', on}` · `{type:'item', itemId}`
  `{type:'defend', by}` · `{type:'flee', ok:bool}` · `{type:'fatigue'}` · `{type:'end', winner:'player'|'enemy'|'fled'}`
- `simulate(n, setupFn) -> stats` (test sorumlusu kullanacak)

## 3) src/core/world.js + src/core/save.js — DÜNYA PROGRAMCISI (DOM yok)
- `createGame(saveData?) -> Game`; `game.toSave()`; save.js: localStorage `edin.save.v1`.
- Game durumu: `{ screen, keeper:{level}, creature:{id,grade,level,oz,egg?}, carriedOz, bankedOz, sekel, belt, inventory, runs, kaderPuani, zoneId|null, pos:{x,z}, monsters:[...], flags }`
- Akış: `chooseStarter(id)` → yumurta → `winsToHatch` (eggHatchWins); `enterZone(id)`; `tick(dt, joystick:{x,z})` hareket + canavar dolaşma + saldırganlık;
  yakın canavar → `game.nearbyMonster`; `startFight(monsterId)` → combat.startBattle; `finishFight(battle)` → öz (levelDiff, ozMult, test ×5), düşme, yumurta, kader puanı, seviye atlama;
  ölüm → kayıp (lossOnDeath, ilk 3 sefer 0) ve kapıya dönüş; `returnToGate()` (dönüş büyüsü 10 sn, savaşta kesilir) ve `depositOz()`; kapıda dükkân `buy(itemId)`; kemer `setBelt`.
- Olay yayını: `game.on(evt, fn)` — `'levelUp','ozGained','ozLost','egg','hatch','drop','zoneChanged','death','deposit','monsterAggro'`.
- Canavar konumları 2B (x,z) dünya birimi; bölge boyutu rules.zones[].size.

## 4) src/ui/* + src/main.js — ARAYÜZ / 3D TASARIMCISI
- Three.js (npm `three`). Yatay ekran, telefon (dar yükseklik ~360px), pixelRatio ≤ 1.5, rules.performance bütçeleri.
- `src/ui/models.js`: kodla low-poly 3D modeller: 4 yaratık (Ugallu, Girtablullu, Kulullu, Kusarikku; 3 büyüme evresi 1/5/10) + bölgelerdeki canavarlar + bekçiler. Her model `{ group, anim:{idle,attack,hit,die,dodge} }`. İleride GLB ile değişecek: tek giriş noktası `getModel(id, stage)`.
- `src/ui/worldView.js`: bölge sahnesi (zemin, kapı, canavarlar, oyuncu yaratığı), 3/4 üstten kamera takibi, sol altta sanal joystick, canavar adında seviye rengi, yakındayken "Saldır" düğmesi, taşınan öz / güvendeki öz / can göstergesi, "Kapıya dön" düğmesi.
- `src/ui/battleView.js`: iki dövüşçü yan yana, Event[]'i animasyonla oynatır (sayı uçuşları: gri blok, beyaz normal, sarı kritik, "Kaçtı!"); saldırı ve koruma bölgesi seçimi, eylem düğmeleri (Vur, Yetenek, Yetenek 2, Kemer, Savunma, Kaç), 15 sn sayaç, "Aynı seçimlerle devam et" (hızlı savaş).
- `src/ui/screens.js`: giriş, başlangıç yaratığı seçimi, yumurta/çatlama, kapı (öz yatırma, dükkân, kemer, bölge seçimi), seviye atlama, ölüm, ayarlar (test ×5 sadece ?test=1).
- `src/main.js`: hepsini bağlar. Çekirdek modüller hazır değilse geçici sahte veriyle çalış ama sözleşmedeki imzaları kullan.

## Ortak kurallar
- Kimse başkasının dosyasını yeniden yazmaz; ihtiyaç olursa `NOTES-<rol>.md` dosyasına not bırakır, müdür birleştirir.
- Her rol kendi birim testini `test/` altına koyar (`node test/<rol>.test.mjs`).
