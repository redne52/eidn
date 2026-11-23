# EDİN v4.1 — RUH ÇEKİRDEĞİ (REVİZE PLAN v2, henüz kod yok)

Ana amaç: Ruh Çekirdekleri yeni OYNANABİLİR KARAKTER kazanma sistemidir. Oyuncu çekirdek biriktirir, 1'li ya da 10'lu açar; çıkan karakteri tutar ya da ruhunu ejderhasına yedirir. En fazla 2 karakter tutulur.

Değişmeyenler: Three.js mimarisi, v2 savaş kuralları (yeni karakterler mevcut rol sayılarını kullanır), Türkçe arayüz, eski kayıt uyumu, sıradan canavarın öz ödülü ve 1 sn'lik ruh yutma animasyonu.
Ertelenenler: çekirdeği şekele satma, çekirdeği doğrudan öze çevirme.
Not: Çekirdekler gerçek parayla SATILMAZ (rastgele ödül + ödeme = bazı ülkelerde kumar sayılabilir). Hepsi oyun içinde kazanılır.

---------------------------------------------------------------------
## 1. Dört çekirdek türü (rules.json > soulCores.types)

| Tür | Renk | Nereden düşer | Amaç |
|---|---|---|---|
| Kil Çekirdek | toprak/gri | Kıyı ve Bozkır'daki nadir canavarlar, Laḫmu | Başlangıç; çoğunlukla düşük dereceli ejderha |
| Lacivert Çekirdek | lapis mavisi | Derin Edin nadir canavarları, Laḫmu (şanslı), Anzû | Orta; mitolojik ihtimali başlar |
| Altın Çekirdek | altın | Anzû, Ušumgallu | Yüksek dereceli ejderha; mitolojik ihtimali artar |
| Kader Çekirdeği | kızıl-mor | Yalnız Ušumgallu | En iyi tablo; C derece çıkmaz |

### 1.1 Düşme oranları (başlangıç önerisi; simülasyonla ayarlanacak)
| Kaynak | Düşen |
|---|---|
| Nadir canavar, Kıyı/Bozkır (Uridimmu, Mušḫuššu) | %30 → 1 Kil |
| Nadir canavar, Derin Edin | %30 → 1 Lacivert |
| Laḫmu (bekçi) | %100 → 1 Kil; ayrıca %20 → 1 Lacivert |
| Anzû (bekçi) | İlk zafer: 1 Altın (garanti). Sonra %100 → 1 Lacivert; ayrıca %30 → 1 Altın |
| Ušumgallu (bekçi) | İlk zafer: 1 Kader (garanti). Sonra %100 → 1 Altın; ayrıca %15 → 1 Kader |
| Sıradan canavar | Çekirdek yok (öz ödülü ve 1 sn yutma aynen) |

Çekirdek ödülü sıradan öz ödülüne EK olarak verilir; nadir/bekçi öz ödülü değişmez (ekonomi korunur).

### 1.2 Hedef birikim (1→13 oynanışı boyunca, simülasyonla doğrulanacak)
Kil 30–40 · Lacivert 8–14 · Altın 4–7 · Kader 2–3. 10'lu açılış oyunun ortasından itibaren (Kil ile) yaklaşık her 45–60 dakikada bir mümkün olmalı.

---------------------------------------------------------------------
## 2. Karakter havuzları — İKİ AYRI TABLO

Her açılış iki adımda çözülür: (1) Tür: ejderha mı mitolojik mi? (2) Derece: C/B/A/S. Sonra türün içinden karakter seçilir.

### 2.1 Tablo A — Mitolojik yaratık çıkma olasılığı (çekirdek türüne göre)
| Çekirdek | Mitolojik taban olasılık |
|---|---|
| Kil | %0 |
| Lacivert | %0,5 |
| Altın | %1,5 |
| Kader | %4 |
Mitolojik havuz: Ugallu, Girtablullu, Kulullu, Kusarikku (eşit olasılık). Ejderha havuzu: Ateş, Su, Zehir, Taş (eşit olasılık).

Erken elde etmeyi önleme:
- Kil çekirdekte mitolojik HİÇ yok; Lacivert ancak Derin Edin'de ve Laḫmu/Anzû'dan, Altın/Kader ancak Anzû/Ušumgallu'dan düşer → mitolojik ihtimal doğal olarak oyunun ikinci yarısında başlar.
- Ek kilit: aktif karakter seviyesi 8'in altındayken mitolojik olasılık 0 (açılabilir ama mitolojik çıkmaz; arayüzde yazar).
- Merhamet sayacı (pity): yalnız Lacivert/Altın/Kader açılışları sayılır. Mitolojiksiz 40 açılıştan sonra her açılışta +%0,5 eklenir; 80. açılış mitolojik garantidir. Mitolojik çıkınca sayaç sıfırlanır. (Eski "kader puanı" bu sayaca taşınır, bkz. 9.)

### 2.2 Tablo B — Derece olasılığı (çekirdek türüne göre)
| Çekirdek | C | B | A | S |
|---|---|---|---|---|
| Kil | %70 | %25 | %4,5 | %0,5 |
| Lacivert | %50 | %35 | %12 | %3 |
| Altın | %30 | %45 | %20 | %5 |
| Kader | — | %50 | %38 | %12 |
| Mitolojik (hangi çekirdekten çıkarsa çıksın) | — | %50 | %35 | %15 |

### 2.3 Mitolojik karakterlerin gücü
v2 savaş kurallarını korumak için mitolojik karakterler, karşılık geldikleri ejderha rolünün sayılarını aynen kullanır (Ugallu=hasar, Girtablullu=zehir, Kulullu=iyileşme, Kusarikku=savunma; veri zaten rules.json'da). Değerleri: nadirlik, kendine özgü görünüm, zincir/bitirici adları ve en az B derece garantisi. Ek güç YOK (denge bozulmaz).

---------------------------------------------------------------------
## 3. Açılış sistemi (1'li ve 10'lu)

- Nerede: savaş dışında her yerde. Sahadayken yalnız ÇANTADAKİ çekirdekler, Ruh Kapısı'nda çanta + DEPO çekirdekleri açılabilir.
- 1'li: 1 çekirdek → 1 sonuç.
- 10'lu: aynı türden 10 çekirdek → 10 sonuç. Garanti: en az 1 sonuç B veya üstü (o çekirdeğin tablosu içinde; Kader zaten B+). Merhamet sayacı 10'lu açılışta her sonuç için ayrı işler.
- Sıra (atomik): (1) çekirdekler düşülür, (2) sonuçlar üretilir, (3) bekleyen sonuç listesi kayda yazılır — üçü tek kayıt işleminde. Görsel gösterim bundan SONRA başlar.
- Sonuç üretimi tohumludur: tohum = (oyun tohumu, açılış sayacı). Sayaç açılıştan önce artırılır ve kaydedilir → sayfayı yenileyip yeniden denemek farklı sonuç vermez.

---------------------------------------------------------------------
## 4. Tut / Yedir ve iki karakter sınırı

- Her sonuç için iki seçenek: [Karakteri tut] [Ruhunu ejderhaya yedir].
- Kadro (Kan Bağları): en fazla 2 karakter. Biri AKTİF (sahada oynayan).
- 3. bir karakteri tutmak için: mevcut 2'den birini seçip değiştirmek gerekir; değiştirilen karakter KALICI olarak gider. Çift onay: "X (Seviye 9, A) kalıcı olarak gidecek."
- Aktif karakteri değiştirme (iki kadro üyesi arasında geçiş): yalnız Ruh Kapısı'nda. Sahada geçiş yok (sefer ortasında kaçış/hile önlenir).
- Yeni tutulan karakter seviye 1'den başlar. Yakalama yardımı: kadrodaki en yüksek seviyeye ulaşana kadar %50 fazla öz kazanır (rules.json).
- Her karakterin kendi seviyesi ve kendi güvendeki özü vardır; kemer, çanta, yemek, kaynak ve çekirdekler hesaba (oyuncuya) aittir. Taşınan öz, kapıda yatırılınca AKTİF karakterin özüne eklenir.
- Aynı türden iki karakter tutulabilir (örn. C ve S Ateş Ejderhası).

### 4.1 Yedirmenin ödülü (ekonomiyi bozmayacak şekilde)
Yedirilen ruh, AKTİF karaktere öz verir:
| Yedirilen | Öz |
|---|---|
| C | 15 |
| B | 30 |
| A | 60 |
| S | 120 |
| Mitolojik (herhangi) | 250 |
Sahada yedirilirse TAŞINAN öze (ölüm kaybı kuralı işler), kapıda yedirilirse GÜVENDEKİ öze eklenir. Kontrol: 1→13 boyunca tahmini toplam yedirme özü, toplam seviye özünün (~27.000) %8'ini geçmemeli; simülasyonla doğrulanır, geçerse tablo küçültülür.
"Hepsini yedir" (10'lu açılışta tek dokunuş) vardır.

---------------------------------------------------------------------
## 5. Çanta, depo ve kapasite

- Çanta (sahada taşınan) çekirdek kapasitesi: başlangıç 20; Ruh Kapısı dükkânında şekelle yükseltme 20 → 30 → 40 → 50 (fiyatlar rules.json; öneri 300 / 700 / 1500 şekel).
- Depo (Ruh Kapısı): kapasite 300, güvenli; ölümde hiçbir zaman kayıp yok.
- Kapıya varışta "Çekirdekleri depoya aktar" düğmesi + ayarlarda "Varışta otomatik aktar" (varsayılan AÇIK).
- Çanta doluyken düşen çekirdek: sonuç ekranında uyarı, çekirdek YERDE kalır (30 sn alınabilir), alınmazsa kaybolur. (Alternatif: sahada hemen açtırmak — önerilmiyor.)
- Bekleyen (açılmış ama karar verilmemiş) sonuçlar çekirdek değildir, ölümde kaybolmaz; karar ekranı sonra yine gelir.

---------------------------------------------------------------------
## 6. Ölümde çekirdek kaybı (kesin tanım)

- Oranlar (rules.json, başlangıç): Kıyı %0 · Bozkır %20 · Derin Edin %40. Ölümün gerçekleştiği bölge geçerli.
- Kapsam: yalnız ÇANTADAKİ çekirdekler. Depodakiler ve bekleyen açılış sonuçları ASLA kaybolmaz.
- Hesap: n = çantadaki toplam çekirdek (bütün türler). Kayıp miktarı k = floor(n × p) + (rastgele < (n × p − floor(n × p)) ? 1 : 0) — "olasılıklı yuvarlama" (beklenen değer tam p). Örnek: 7 çekirdek, Bozkır %20 → 1,4 → 1 kesin, %40 ihtimalle 2.
- Hangi çekirdekler: k adet, çantadaki çekirdekler arasından eşit olasılıkla, tohumlu rastgele seçilir (değerliler korunmaz, değerliler özellikle de hedeflenmez).
- İlk 3 sefer koruması (mevcut kural) çekirdekler için de geçerli: kayıp 0.
- Ölüm ekranında: "Kaybedilen çekirdekler: 1 Kil, 1 Lacivert".
- Tohum ve sayaç kayda yazılır; ölüm işlemi idempotent (aynı ölüm iki kez işlenmez).

---------------------------------------------------------------------
## 7. İki ayrı ruh yutma animasyonu

### 7.1 Savaş yutması (mevcut, korunur)
Canavar düşer, göğsünden turkuaz ruh yükselir, CatmullRom yollarla ejderhanın ağzına akar, göz/boğaz/pul parlar, beden çözünür, "+N öz". Normal 1 sn, nadir 2 sn, bekçi 3,5 sn.
Ek: nadir/bekçi çekirdek düşürdüyse yutmadan sonra bedenin göğsünden kademe renginde kristal fırlar ve çanta simgesine uçar (0,6 sn).

### 7.2 Karakter ruhu yutma (YENİ, farklı görünüm)
Sahne: açılış ekranının önünde, ejderha ile yedirilecek karakter karşı karşıya.
1. Karakter, kendi 3D modelinin YARI SAYDAM HAYALETİ olarak belirir (fresnel kenar ışığı, derece renginde iç parıltı; mitolojikte kızıl-mor).
2. Hayalet başını eğer (saygı/kabul), sonra bedeni uçlardan başlayarak ince ışık şeritlerine çözülür (vertex shader ile ağza doğru uzama).
3. Ejderha başını kaldırır, ağzını açar; şeritler savaş yutmasındaki düz akıştan farklı olarak ağzın önünde dönen bir GİRDAP oluşturur ve sarmal hâlde içeri çekilir.
4. Ejderhanın göğsünde kalp atışı gibi 2 nabız (derece renginde), pul çizgileri boyunca ışık yayılır, kısa bir kükreme/nefes buharı.
5. "+N öz" ve küçük derece rozeti.
Süre: C/B 2 sn · A/S 2,5 sn · Mitolojik 4 sn. Dokununca ×4. Azaltılmış efektte sade (hayalet + kısa akış). 10'lu "Hepsini yedir"de tek birleşik sahne: hayaletler sırayla girdaba katılır, toplam ≤ 4 sn.
Bütçe: ≤ 180 parçacık, hayalet için modelin kopyası tek malzemeyle (+1–2 çizim çağrısı).

### 7.3 Açılış animasyonu
Kristal ortada döner, çatlaklar derece renginde parlar, kırılır, ışık sütunu (C gri, B yeşil, A mavi, S altın, mitolojik kızıl-mor + ekran titremesi). Karakter kartı açılır (3D önizleme, ad, derece, rol, zincirler). 10'lu: 10 kristal yan yana sırayla kırılır, en yüksek derece sona bırakılır; "Atla" düğmesi doğrudan özet ekranına götürür.

---------------------------------------------------------------------
## 8. Kayıt güvenliği (yenileme ve tekrar eden işlemler)

Kayıt alanları:
- `cores: { bag: {kil,lacivert,altin,kader}, depot: {...}, bagCap }`
- `roster: [ {uid, species, grade, level, oz, legacyId?} ]` (≤2), `activeUid`
- `pulls: { counter, pityMythic, pending: [ {id, coreType, species, grade, mythic, state:'pending'|'kept'|'fed'} ] }`
- `opLog`: son 50 işlemin kimliği (idempotentlik için)

Kurallar:
- Her işlemin (aç, tut, yedir, değiştir, depoya aktar, ölüm) benzersiz bir kimliği vardır; aynı kimlik ikinci kez gelirse işlem yok sayılır.
- Açılış: çekirdek düşme + sonuç üretme + pending'e yazma tek kayıtta. Yenilemede pending sonuçlar karar ekranında tekrar gösterilir; yeni çekirdek düşmez, yeni sonuç üretilmez.
- Tut/yedir: pending kaydın state'i değişmeden ödül verilmez; state ve ödül aynı kayıtta değişir.
- Değiştirme (3. karakter): eski karakterin silinmesi + yenisinin eklenmesi + pending state='kept' tek kayıtta.
- Animasyonlar yalnız görseldir; kesilmeleri hiçbir sayıyı değiştirmez.

---------------------------------------------------------------------
## 9. Mevcut sistemlerle ilişki ve eski kayıt geçişi

- Yumurta sistemi çekirdeklerle BİRLEŞİR: canavarların yumurta düşürmesi kaldırılır, yerine çekirdek düşmesi gelir (tek ödül yolu). Başlangıç seçimi (4 ejderha, C) aynen kalır.
- Kader puanı → mitolojik merhamet sayacına taşınır (her 1 kader puanı = 2 sayaç).
- Geçiş (kayıt sürüm 3): mevcut yaratık → roster[0] (aktif); çantadaki/kuluçkadaki yumurtalar → depoya Kil Çekirdek (1:1; kuluçka ilerlemesi kaybolur, ilk açılışta bilgi notu); cores/pulls/opLog boş varsayılan; v1 → v2 → v3 zincir geçişi; idempotent. NOTES-gecis.md güncellenir.
- Bağ yenileme ekranı ve kapı bekçisi seviye bedeli: kadro sistemine dönüşür (değiştirme kalıcı kayıp olduğu için ayrı seviye bedeli KALDIRILIR). Onay gerekir.

---------------------------------------------------------------------
## 10. Arayüz
- Ruh Kapısı: yeni "Çekirdekler" düğmesi → açılış ekranı (tür seçimi, sahip olunan sayı, [Aç ×1] [Aç ×10], mitolojik olasılığı ve merhamet sayacı görünür — Google Play olasılık gösterme kuralına da uygun).
- Ruh Kapısı: "Kan Bağları" paneli → 2 kadro kartı, aktifi seç.
- Saha HUD'u: çantadaki çekirdek sayısı (küçük kristal + sayı / kapasite).
- Ölüm ekranı: kaybedilen çekirdekler satırı.

---------------------------------------------------------------------
## 11. Testler
Otomatik:
1. Düşme oranları (100.000 tohumlu deneme) tablolara ±%0,3 içinde uyuyor.
2. Kil'den mitolojik çıkmıyor; seviye < 8 iken mitolojik çıkmıyor; merhamet 80'de garanti.
3. 10'lu açılışta en az 1 B+ garantisi.
4. Yenileme: pending sonuç tekrar üretilmiyor, çekirdek tekrar düşülmüyor; aynı işlem kimliği iki kez ödül vermiyor.
5. Kadro sınırı 2; değiştirme kalıcı; geçiş yalnız kapıda.
6. Ölüm kaybı: oran, olasılıklı yuvarlama (beklenen değer), depo ve pending korunuyor, ilk 3 sefer koruması.
7. Yedirme özü sahada taşınana, kapıda güvendekine.
8. Eski kayıtlar (v1, v2, savaş ortası, yumurtalı) açılıyor.
9. 1→13 simülasyonu: süre 3–5 saat; birikim hedefleri (1.2); yedirme özü ≤ %8; mitolojik ortalama elde etme zamanı ve oranı raporlanır.
Tarayıcı (telefon taklidi, gerçek dokunma): nadir canavardan çekirdek düşmesi → 1'li açılış → tut → kadroda 2 karakter → 10'lu açılış → hepsini yedir (girdap animasyonu) → 3. karakteri tutmak için değiştirme onayı → kapıda aktif geçiş → Bozkır'da ölüm ve çekirdek kaybı → açılış ortasında sayfa yenileme → 3 grafik ayarı.

---------------------------------------------------------------------
## 12. Onaya sunulan kararlar (müdür önerileri)
1. Dört tür: Kil / Lacivert / Altın / Kader ve düşme tablosu (1.1).
2. Mitolojik olasılıkları %0 / %0,5 / %1,5 / %4, seviye 8 kilidi, merhamet 40→80.
3. Mitolojik karakterler ek güç almaz, en az B derece.
4. Yeni karakter seviye 1'den başlar + %50 yakalama yardımı.
5. Aktif karakter geçişi yalnız Ruh Kapısı'nda.
6. Yedirme öz tablosu (15/30/60/120/250) ve %8 tavanı.
7. Çanta 20 → 50 (şekelle), depo 300, varışta otomatik aktarma.
8. Ölüm kaybı yalnız çanta, olasılıklı yuvarlama, eşit rastgele seçim.
9. Yumurta düşmesi çekirdeklerle birleşir; bağ yenileme bedeli kalkar.

---------------------------------------------------------------------
## 13. SON DÜZELTMELER (v3 — kullanıcı değerlendirmesi, uygulamaya esas)

1. Mitolojik oranlar simülasyonla seçilir. Aday A: %0 / %0,5 / %1,5 / %4 + 80 açılış garantisi. Aday B: %0 / %0,25 / %1 / %3 + 120 açılış garantisi. Seçim ölçütü (önceden sabit): 1→13 bitiminde oyuncuların %25–45'inin en az 1 mitolojiğe sahip olması; ilk mitolojiğe kadar geçen medyan oynama süresi 4–8 saat; 4 mitolojiğin tamamı için medyan ≥ 20 saat. Ölçüte daha yakın aday seçilir, sonuç raporlanır.
2. Aktif karakter seviyesi < 8 iken açılan çekirdekler merhamet sayacını İLERLETMEZ.
3. Yeni karakter başlangıç seviyesi iki seçenekle simüle edilir: (a) seviye 1 + %50 yakalama yardımı, (b) kadrodaki en yüksek seviyenin %70'i (aşağı yuvarlanır, en az 1), öz 0. Ölçüt: yeni karakterle önceki seviyeye dönüş süresi ve 1→13 toplam süreye etkisi. Tekrara zorlamayan yöntem önerilir (beklenen: b).
4. Eski yumurtalar Kil Çekirdeğe ÇEVRİLMEZ. Yumurtalar dereceleri ve kuluçka ilerlemeleriyle "Eski yumurta" olarak kalır; kuluçka zaferlerle devam eder; çatlayınca türü ejderha eşlemesiyle, derecesi korunarak bir açılış sonucu (pending) olur ve Tut/Yedir kararı sorulur. Yeni yumurta düşmez.
5. Üçüncü karakteri tutarken değiştirme çift onaylıdır; AKTİF karakter doğrudan silinemez (önce Ruh Kapısı'nda diğerine geçilmeli; o zamana kadar sonuç bekler). Değiştirmenin şekel ya da seviye bedeli YOK.
6. Kader puanı geçişi: her tam 10 puan = 1 "Kader Mührü" (eski garantiyle aynı: kullanılınca A %80 / S %20 ejderha sonucu); kalan puanlar ×2 merhamet sayacına eklenir. Testle doğrulanır: geçiş öncesi garanti hakkı sayısı = geçiş sonrası mühür sayısı.
7. Mitolojik toplama süresi 1→13 süresinden AYRI ölçülür (13'ten sonra da oynamaya devam eden yapay oyuncu).
8. Çözülme efekti: her standart malzemede (GLB'ler dahil) çalışan onBeforeCompile gürültü-kesme (dissolve); derleme başarısız olur ya da malzeme uyumsuzsa yedek: opaklık + küçülme + parçacık. Hayalet: tek geçersiz kılma malzemesi (fresnel); yedeği MeshBasicMaterial saydam.
9. Aç, üret, tut, yedir, değiştir, mühür kullan, depoya aktar, ölüm: hepsi işlem kimliğiyle idempotent; tek kayıt işleminde.
10. Dört çekirdek türü, iki karakter sınırı, 1'li/10'lu açılış, güvenli depo, iki ayrı ruh yutma animasyonu aynen.

Uygulama sırası: (1) çekirdek/karakter mantığı + simülasyonlar → testler; (2) kayıt geçişi → testler; (3) 3D animasyonlar ve arayüz → testler; teslim: oyun, ZIP, test raporu, değişiklik listesi.
