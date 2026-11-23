# Edin v2 — Yeni savaş sistemi sözleşmesi (müdür)

Karar (kullanıcı onayı: "MMO örneklerinden en iyisini uygula"): Bölge seçimi (saldırı/koruma, baş/gövde/kanat/bacak, başa kritik sersemletme, korunan bölge ×0.3) TAMAMEN KALKAR.
Yeni sistem 3 MMO örneğinin birleşimi:
- FFXIV zincir komboları: belirli hamle sırası (ör. Hızlı → Hızlı → Ağır) kombo bonusu verir; sıradaki doğru düğme parlar.
- WoW kombo puanları: hamleler "Kan Ateşi" puanı biriktirir (en fazla 5); Bitirici (imza vuruşu) bütün puanları harcar, gücü puan başına artar.
- Blade & Soul karşı saldırı: düşman bazı turlarda ağır vuruşunu belli eder; o tur Savunma seçilirse KARŞI SALDIRI olur.
Kalanlar: blok/kaçınma/kritik istatistikten, durum etkileri, kemer, kaçış, yorgunluk, öğretici, 15 sn sayaç, hızlı savaş ("Aynı hamleyle devam" → artık "Otomatik kombo": sıradaki parlayan hamleyi oynar).

## Hamleler (choice.action)
- `quick` Hızlı vuruş: düşük hasar, düşmanın kaçınma şansı azalır, +1 puan.
- `heavy` Ağır vuruş: yüksek hasar, düşmanın kaçınma şansı artar, +1 puan.
- `guard` Savunma: gelen hasar azalır; düşman o tur telgrafladığı ağır vuruşu yaparsa → karşı saldırı (hasarın çoğu engellenir, düşmana vuruş, +1 puan, kısa sersemletme şansı).
- `finisher` Bitirici: ≥1 puan gerekir, hepsini harcar; yaratığın imza vuruşu (rol etkisi: hasar/zehir/iyileştirme/kalkan) puanla ölçeklenir.
- `item` (itemId), `flee`.
Kesin sayılar tasarımcı tarafından rules.json > combat2 altında belirlenir (sim ile denge).

## Zincirler
Her yaratığın zincirleri rules.json > creatures.<id>.chains: `[{id, name, seq:['quick','quick','heavy'], effect:{...}, minGrade?}]`.
C/B: 2 zincir, A/S: 3 zincir (3. zincir = eski ikinci yetenek). Eski aktif yetenek zincir bitişi/ bitirici olur; pasif kalır. Zincir 13. seviye kuralı yerine: 1. zincir 1. sv, 2. zincir 5. sv, 3. zincir (A/S) 10. sv (tasarımcı sim ile onaylar).
Zincir bitince: bonus hasar/etki + ekstra +1 puan. Yanlış hamle zinciri sıfırlar (o hamle yeni zincirin ilk adımı olabilir).

## combat.js API değişikliği
- `playTurn(battle, choice)`; choice = `{action, itemId?}` (bölge alanları YOK).
- `battle.player.points`, `battle.enemy.points` (düşman da kullanır, basit), `battle.player.chainProgress` (son hamleler).
- `battle.enemy.telegraph`: `null | 'heavy'` — tur BAŞINDA belirlenir ve arayüz gösterir (yaklaşık %50 tur; rules.combat2.telegraphChance).
- `comboHints(battle) -> [{chainId, name, step, len, next}]` — arayüz parlatma için.
- `autoChoice(battle)` — süre dolunca/otomatik kombo: en uzun ilerlemiş zincirin sıradaki hamlesi, telegraph varsa guard, 5 puanda finisher.
- Event'ler: `{type:'order'}`, `{type:'hit', by, move:'quick'|'heavy'|'finisher'|'counter', result:'dodge'|'block'|'normal'|'crit', dmg}`, `{type:'combo', by, chainId, name}`, `{type:'points', on, value}`, `{type:'telegraph', on:'enemy', move:'heavy'}`, `{type:'counter', by}`, `{type:'finisher', by, points, name}`, + eski status/dot/heal/stun/item/defend/flee/fatigue/end.

## Arayüz
Savaş ekranından bölge panelleri kalkar. Alt şerit: [Hızlı] [Ağır] [Savunma] [BİTİRİCİ (puan sayısı, 5'te parlar)] + kemer + Kaç. Üstte yaratığın altında 5 Kan Ateşi noktası. Sağda/üstte zincir şeridi: her zincirin adı ve adımları simgelerle, ilerleyen adımlar dolu; sıradaki doğru düğme altın çerçeveyle parlar (FFXIV gibi). Düşman telgrafı: canavarın üstünde kırmızı "Ağır vuruş hazırlıyor!" simgesi + kısa kırmızı parlama; karşı saldırıda özel efekt. Kombo tamamlanınca büyük isim yazısı ("Fırtına Pençesi!"). Tek dokunuşla oynanır: hamleye basınca tur oynar (Onayla düğmesi kalkar).
