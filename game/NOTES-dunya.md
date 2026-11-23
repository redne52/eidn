# Dünya programcısı notları

- `chooseStarter(id)` yumurtayı hemen çatlatır (Kural Kitabı §1: "İlk yumurta ısınmayı beklemez"). Sözleşmedeki "yumurta → winsToHatch" sadece sonraki yumurtalar için geçerli.
- Rastgele sayı üreteci için `rng.js`'teki `createRng` kullanılıyor (combat `rng.range` istiyor).
- Kemer dünyada 4 cep dizisi olarak tutuluyor (`game.belt[i] = {itemId,count}|null`). Savaşa `game.beltMap()` ({itemId:count}) veriliyor; savaştan sonra `battle.belt` kalanlarına göre cepler azaltılıyor.
- Saldırgan canavar oyuncuya değince `pendingFightUid` set edilir ve `fightForced` olayı yayılır. Arayüz bunu görünce `game.startFight()` çağırmalı (zorunlu savaş).
- Bölgeye kapıdan girmek: `enterZone(id)`; açık her bölgeye doğrudan girilebilir (mobil kolaylık). Bölgeler arası geçitler de çalışıyor (`layout().passages`).
- Kapıya yürüyerek (`layout().gate` halkası), dönüş büyüsüyle ya da dönüş tabletiyle varılır. Üçü de seferi bitirir, özü yatırır, canı doldurur.
- Ölüm ekranı `screen === 'dead'`; arayüz `dismissDeath()` ile kapı ekranına geçer.
- Gri canavar yumurta ısıtmaz ama eşya düşürebilir.
- 10. seviye sadece görünüş (`growthStage` olayı).
- Bekçinin ödül özü `guardianOzMult` (×5) ile çarpılıyor; şekel `constants.guardianSekel`.
- Sözleşmede eksik: savaşın ortasında çıkış (`quitFight()` → yenilgi) ve `settings` alanları eklendi.

## v4 Tur 3 — kaynak, yemek, kamp (world.js)
- Veriler rules.json: `resources` (türler, `perZone`, sabit `nodes`, `gatherSeconds`, `gatherRadius`), `recipes` (`list`, `cookSeconds`, `eatSeconds`), `camps` (`byZone`, `safeRadius`, `useRadius`, `cooksPerRunPerCamp`), `inventory`.
- Durum: `food`, `resources`, `nodes` (düğüm id → respawnAt; kayıtta kalan saniye), `buffs {atk,fights}`, `camps {zoneId:{cooks}}` (her sefer başında sıfırlanır), `action` (kaydedilmez).
- API: `startGather(id?)`, `startEat(id)`, `cancelAction()`, `cook(id)`, `canCook(id)`, `cooksLeft()`, `edibles()`, `zoneNodes()`, `nodeReady(id)`, `atCamp()`, `inCampRing()`, `resourceRoom(t)`, `foodRoom(id)`.
- Olaylar: `actionStart`, `actionProgress`, `actionCancelled{reason}`, `gathered`, `ate`, `cooked`, `buff`, `nearbyNode`, `nodeRespawn`, `bagFull`.
- Kurallar: hareket ya da saldırı eylemi iptal eder (malzeme/yemek harcanmaz). Savaşta yeme yok. Kamp halkasında canavar doğmaz/girmez/saldırmaz; kamp öz yatırmaz. Ruhlu et buff'ı `makeCombatant(... mods:{atk})` ile verilir (formül aynı), her savaş sonunda 1 azalır.
