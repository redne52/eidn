# NOTES — v4.1 Ruh Çekirdeği (çekirdek mantığı + simülasyon kararları)

Kaynak plan: PLAN-v4.1-cekirdek.md (13. bölüm esas). Kod: src/core/cores.js (world.js içinden installCores ile kurulur).
Simülasyon: tools/cores_sim.mjs (gerçek world.js + combat.js ile oynar). Komutlar:
- `node tools/cores_sim.mjs 200` → 1→13, 7 yapılandırma × 200 deneme
- `COLLECT=1 CAP=80 node tools/cores_sim.mjs 200` → 13'ten sonra 4 mitolojiğin toplanması (AYRI ölçüm)

## Politika (simülasyondaki yapay oyuncu)
playthrough.mjs ile aynı av/yeme/dönüş + çekirdek politikası: kapıda bütün çekirdekleri aç (10'lu öncelikli); mitolojiği her zaman tut; kadroda yer varsa B+ tut; diğer kadro üyesinden iyi dereceyi değiştirerek tut; gerisini yedir. Bekçiye, seviyesi bekçi seviyesi − 1 olunca girer (gerçek oyuncu davranışına yakın; Kader/Altın bu yüzden 13'ten önce de düşer).
Aktif geçiş politikası üç türlü ölçüldü: her daha iyi dereceye geç / yalnız A-S-mitolojiğe geç / hiç geçme.

## Sonuçlar (N=200; süreler oyun saati)
| Aday | Başlangıç | Geçiş | 1→13 medyan (p10–p90) | Kil/Lac/Altın/Kader | Yedirme özü | 13'te ≥1 mitolojik | Eski seviyeye dönüş medyan (p90) |
|---|---|---|---|---|---|---|---|
| A | seviye 1 + %50 | her iyiye | 5,76 (4,28–7,85) | 33,1/10,8/4,3/1,5 | %3,6 | %19 | 51 dk (118) |
| A | en yüksek × %70 | her iyiye | 5,43 (4,21–6,74) | 34,7/11,4/4,1/1,4 | %3,7 | %13,5 | 42 dk (86) |
| B | seviye 1 + %50 | her iyiye | 5,54 (4,19–7,54) | 32,3/10,7/4,2/1,5 | %3,5 | %11 | 49 dk (117) |
| B | en yüksek × %70 | her iyiye | 5,25 (4,21–6,64) | 33,9/11,0/4,0/1,4 | %3,6 | %8 | 42 dk (85) |
| A | seviye 1 + %50 | yalnız A/S/mit. | 5,03 (4,02–6,95) | 32,6/10,7/4,3/1,6 | %3,6 | %18 | 62 dk (117) |
| A | en yüksek × %70 | yalnız A/S/mit. | 4,78 (4,02–6,10) | 34,3/10,6/4,1/1,5 | %3,6 | %15,5 | 46 dk (89) |
| A | en yüksek × %70 | geçiş yok | 3,73 (3,43–4,00) | 20,6/8,7/2,5/1,3 | %2,5 | %14 | — |

Mitolojik toplama (13'ten sonra oynamaya devam; tavan 80 sa; N=200; en yüksek × %70):
| Aday | İlk mitolojik medyan (p25–p75) | 4 mitolojiğin tamamı medyan (p25) | 80 saatte tamamlayan |
|---|---|---|---|
| A | 8,7 sa (7,6–9,9) | 36,1 sa (29,6) | %97 |
| B | 11,7 sa (10,1–12,8) | 58,9 sa (45,2) | %79 |

## Seçimler
1. **Mitolojik oran: Aday A** (%0 / %0,5 / %1,5 / %4; merhamet yumuşak 40'tan, sert 80). Önceden sabit ölçüt: 13 bitiminde %25–45 en az 1 mitolojik; ilk mitolojik medyan 4–8 sa; dördü ≥ 20 sa. A: %13,5–19 / 8,7 sa / 36 sa. B: %8–11 / 11,7 sa / 59 sa. İkisi de ilk iki ölçütün altında kalıyor; A ölçüte her maddede daha yakın ve "dördü ≥ 20 sa" şartını rahat karşılıyor. Ölçüte tam ulaşmak için oranları adayların ötesine çıkarmadım (karar senin).
2. **Başlangıç seviyesi: kadrodaki en yüksek seviyenin %70'i** (aşağı yuvarlanır, en az 1, öz 0). Seviye 1'e göre eski seviyeye dönüş medyanı 51 → 42 dk (p90 118 → 86 dk), 1→13 süresi kısalıyor ve uzun kuyruk küçülüyor (p90 7,85 → 6,74 sa). Seviye 1 + %50 yardım yöntemi erken geçişlerde benzer, geç geçişlerde çok daha fazla tekrar istiyor.
3. **Düşme oranı ayarları** (plan 1.1'e göre değişiklik, hedef birikim 1.2'ye çekmek için):
   - Nadir canavar şansı: Kıyı/Bozkır %30 → %45 (Kil 20–24 → 33–35), Derin %30 → %20 (Lacivert 15,6 → 10,6–11,4).
   - Anzû: ilk zafer 2 Altın; sonraki her zafer 1 Altın + 1 Lacivert; ek %50 Altın ve %15 Kader (Altın 1,3 → 4,1–4,3).
   - Laḫmu ve Ušumgallu plan 1.1'deki gibi.
   - Kader 13'te ortalama 1,3–1,6 (hedef 2–3'ün altında): Ušumgallu 13. seviye bekçi olduğu için 13'ten önce az düşüyor. Bilerek bırakıldı (en nadir tür).

## Not edilenler
- 1→13 süresi geçiş yapılmazsa 3,7 sa (hedef 3–5 içinde); oyuncu her daha iyi dereceye geçerse ~5,4 sa (hedefin biraz üstü). Bu, oyuncunun kendi tercihi olan "yeniden büyütme" süresidir; yalnız A/S/mitolojiğe geçen oyuncu 4,8 sa.
- Yedirme özü toplam seviye özünün (27.320) %2,5–3,7'si; tavan %8'in çok altında.
- Bekçiye bir seviye eksikken giren politika ölüm sayısını artırıyor (10,5–14,7 / oyun). Çekirdek kaybı yalnız çantada; depo varışta otomatik.
- Mitolojik karakterler eşlendikleri ejderha rolünün sayılarını aynen kullanır (test edildi: aynı can ve istatistik).
