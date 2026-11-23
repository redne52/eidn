# Edin v4 — Kayıt geçişi ve ejderha verisi (Ekip B)

## Ejderhalar
Savaş sayıları eski rolden birebir kopyalandı (base, growth, pasif etkisi, zincir sıraları/etkileri/minGrade, bitirici etkisi). Sadece ad, id ve tema değişti.

| id | Ad | Eski kaynak | Pasif | Zincirler (sıra) | Bitirici |
|---|---|---|---|---|---|
| ejder_ates | Ateş Ejderhası | ugallu (hasar) | Kor Öfkesi | Kor Pençe (A-H) · Alev Sağanağı (H-H-A) · Ejder Kükremesi (H-A-A, A+) | Ateş Nefesi |
| ejder_su | Su Ejderhası | kulullu (iyileştirme) | Apsû Pulu | Apsû Pınarı (A-H) · Gelgit Kanadı (H-H-A) · Derin Dalga (H-A-A, A+) | Ea'nın Nefesi |
| ejder_zehir | Zehir Ejderhası | girtablullu (zehir) | Zehir Pulu | Zehirli Diş (H-A) · Boğucu Kuyruk (A-A-H) · Zehir Aynası (A-H-H, A+) | Mor Sis Nefesi |
| ejder_tas | Taş Ejderhası | kusarikku (savunma) | Kaya Gövde | Boynuz Çarpması (H-A) · Taş Kalkan (A-A-H) · Eşik Kayası (A-H-H, A+) | Dağ Darbesi |

(H = Hızlı, A = Ağır.) Ejderha kayıtlarında ek alanlar: `kind:'ejderha'`, `element`, `colors`, `legacyOf`.

## Eski dört yaratık
- `rules.creatures.{ugallu,girtablullu,kulullu,kusarikku}` silinmedi: `legacy: true`, `replacedBy: <ejderha id>`.
- Oynanabilir listede yoklar (`start.creatureChoice` = 4 ejderha; `combat.playableIds()`).
- Yabani düşman olarak yaşamaya devam ediyorlar (`*_yabani` canavar tipleri, değişmedi).
- `rules.collection.entries` içinde mitolojik koleksiyon girdisi olarak duruyorlar (gelecek sürüm; modül yok).
- Yabani canavarların `eggOf` alanı ejderhaya çevrildi (ör. Yabani Kulullu → Su Ejderhası yumurtası).

## Kayıt geçişi (src/core/migrate.js)
- Kayıt sürümü 1 → **2**. Depolama anahtarı aynı (`edin.save.v1`); sürüm kaydın içindeki `version` alanında.
- `migrateSave(data)` hem `createGame(saveData)` hem `loadSave()` içinde çağrılır. Girdiyi değiştirmez, kopya döner.
- Sürüm alanı olmayan kayıt v1 sayılır. `version > 2` (tanınmayan gelecek sürüm) veya bilinmeyen yaratık id'si → `null` (yeni oyun).
- v1 → v2 adımları:
  1. `creature.id` eşlenir: ugallu→ejder_ates, kulullu→ejder_su, girtablullu→ejder_zehir, kusarikku→ejder_tas (`rules.legacyMap.creatures`). Eski id `creature.legacyId`'de saklanır.
  2. Seviye, derece, öz, can, yara süresi, taşınan öz, şekel, kemer, çanta, bölgeler, bekçiler, kader puanı aynen korunur.
  3. Yumurtalarda `species` aynı tabloyla eşlenir, eski değer `legacySpecies`'te saklanır.
  4. Yeni alanlar güvenli varsayılanla eklenir: `food:{}`, `resources:{}`, `camps:{}`, `collection:{}`.
  5. `migratedFrom: 1` eklenir; oyunda `game.flags.migratedFrom` olarak görünür (arayüz bir kez "Yaratığın ejderhaya dönüştü" mesajı gösterebilir).
- İdempotent: v2 kayda tekrar uygulamak hiçbir şeyi değiştirmez (testli).
- Savaş ortası v1 kaydı: eskisi gibi kaçış sayılır, yaratığın o anki canı korunur, aynı bölgede açılır (testli).
- Yeni oyunda eski id verilirse (`chooseStarter('ugallu')`, `addEgg('kulullu')`) aynı tabloyla ejderhaya çevrilir.

## Ruh özü emme (çekirdek)
- `finishFight()` dönüşünde `absorb: { kind: 'normal'|'rare'|'guardian', oz, dur, monsterUid, pos:{x,z} }`. Sadece görsel bilgi.
- Öz ödülü `finishFight` içinde bir kez verilir. `finishFight` artık idempotent: aynı savaş ikinci kez bitirilirse önceki sonucu döner, ödül/ceza tekrar uygulanmaz (testli).
- Süreler `rules.absorbFx.durations` (normal 1, nadir 2, bekçi 3,5 sn), hız seçenekleri `speedOptions` [1,2,4], azaltılmış efektte `reducedFxMult` 0,5.
- Nadir: canavar tipinde `rare: true` (Uridimmu, Mušḫuššu). Bekçi her zaman `guardian`.
- Emme sırasında kayıt alınırsa öz zaten taşınan özde; yükleyince bir kez sayılmış olur (testli).

## Gelecek için şema (Tur 3 dolduracak; modül yok)
- `rules.inventory` (yemek 6 yuva × 10, kaynak 8 yuva × 20), `rules.resources.types`, `rules.recipes.list`, `rules.camps.byZone` — boş ama tanımlı.
- Oyun durumu ve kayıt: `food`, `resources`, `camps`, `collection`.

## Arayüz için notlar (Ekip A/C)
- `test/ui.test.mjs` şu an kırmızı: rules.creatures'ta 4 ejderha var ama `models.js`'te ejderha modeli yok (genel yedek model döndüğü için "evreler arası şekil farkı yok" hatası). Ekip A ejderha modellerini ekleyince düzelir.
- `src/ui/labels.js` eski yetenek id'leri için Türkçe adlar tutuyor; yeni ejderha zincir/bitirici adları rules.json'da zaten Türkçe karakterli.
- `src/ui/core.js` / `main.js` kayıt yüklerken `loadSave()` kullanıyorsa geçiş kendiliğinden işler.

## v3 geçişi (v4.1 — kadro + ruh çekirdekleri)
Zincir: v1 (sürümsüz) → v2 (ejderha) → v3. `SAVE_VERSION = 3`, depolama anahtarı aynı (`edin.save.v1`). `migrateSave` girdiyi değiştirmez, idempotenttir (v3 kayda tekrar uygulamak hiçbir şeyi değiştirmez; testli).
1. **Kadro:** mevcut yaratık `roster[0]` olur ve aktiftir (`activeUid = 'c1'`). Seviye, derece, öz, can, yara süresi ve `legacyId` korunur. `creature` alanı kayıtta aktif karakterin kopyası olarak yazılmaya devam eder (eski arayüz uyumu).
2. **Eski yumurtalar ÇEVRİLMEZ.** Çatlamamış yumurtalar derece, kuluçka ilerlemesi (`heat`) ve kuluçkadaki yumurta seçimiyle kalır; `legacy: true` işareti alır. Kuluçka zaferlerle sürer. Çatlayınca derece korunarak bekleyen açılış sonucu (`pulls.pending`, `source:'egg'`) olur; Tut/Yedir sorulur. Geçiş anında zaten çatlamış (bağlanmamış) yumurta varsa doğrudan bekleyen sonuç olur. Yeni yumurta düşmez.
3. **Kader puanı:** her tam 10 puan = 1 **Kader Mührü** (eski garantiyle aynı: kullanılınca A %80 / S %20 ejderha sonucu). Kalan puanlar × 2 mitolojik merhamet sayacına eklenir. Eski değer `legacyKaderPuani` alanında saklanır, `kaderPuani` 0 olur. Test: 23 puan → 2 mühür + merhamet 6 (garanti hakkı sayısı korunur).
4. **Yeni alanlar (güvenli varsayılan):** `seed` (eski kayıttan deterministik türetilir), `roster`, `activeUid`, `charSeq`, `cores {bag, depot, bagCap:20, capLevel:0, autoDeposit:true}`, `pulls {counter, seq, pity, pending, history}`, `kaderMuhru`, `opLog`.
5. Kadrodaki bilinmeyen karakter id'si → kayıt reddedilir (`null`).
6. Savaş ortası v2 kaydı: aynı bölgede açılır, can ve taşınan öz korunur; ikinci yüklemede kadro/çekirdek/bekleyenler aynen (testli).
