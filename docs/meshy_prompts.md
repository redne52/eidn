# Edin — Meshy / Hy 3D çevre modeli üretim talimatları

Bu modeller, oyundaki kodla üretilmiş geçici çevre parçalarının yerine geçecek. Hepsi aynı stil çizgisinde olmalı ki dünya tek elden çıkmış gibi görünsün.

**Ortak stil (her promptun sonuna ekle):**
`stylized realism, ancient Mesopotamian architecture, hand-painted PBR textures, weathered and eroded, warm sunset palette, game-ready low-poly mesh, clean silhouette, no text, no logos, single object centered, neutral background`

**Ortak teknik hedefler (mobil + web):**
- Format: GLB, Y yukarı, 1 birim = 1 metre, pivot nesnenin tabanında ortada.
- Doku: Base Color + Normal + Roughness (ORM varsa daha iyi). Mobil için 1024×1024 (büyük yapılar), 512×512 (küçük parçalar). Oyunda 512'ye indirilecek.
- Gölge pişirme (AO) dokuya işlenmiş olsun; oyunda gerçek zamanlı gölge az kullanılıyor.
- Animasyon ve rig yok (çevre parçaları).
- Meshy'de "Remesh / Low Poly" ile hedef üçgen sayısına indir, ardından "Texture" adımında PBR üret.

---

## 1. Ruh Kapısı (Spirit Gate) — en önemli parça

**Hedef:** 6.000–9.000 üçgen, 2048 doku (oyunda 1024'e iner). Yükseklik ≈ 12 m, genişlik ≈ 10 m.

**Prompt (EN):**
> A monumental ancient Mesopotamian city gate inspired by Babylonian glazed-brick architecture: two massive square towers with stepped crenellations, a tall arched passage between them, walls covered in deep cobalt-blue glazed bricks with rows of golden relief dragons and bulls walking in profile, thin gold trim bands, cuneiform inscriptions carved into clay panels on the side walls, standing on a three-tier weathered sandstone platform with a wide broken staircase in front, some cracked and missing bricks, sand piled at the base, the arch opening is empty (no door), majestic and mystical

**Türkçe açıklama:** Oyunun en çok görülen yapısı. Kemerli açıklık boş kalmalı; oyundaki portal ışığı oraya ayrıca yerleştiriliyor. Ön yüzde altın ejder-boğa frizi, yan yüzlerde çivi yazılı kil panolar olmalı. Bizim oyundaki ejderha sırası ile aynı tarzda olması için hayvanlar profilden ve yürür halde çizilsin.

**Negatif prompt:** `modern, sci-fi, door, people, text, logo, symmetric perfect new, plastic`

---

## 2. Tapınak kalıntısı A — Zigurat basamakları (uzak plan)

**Hedef:** 2.500–4.000 üçgen, 1024 doku. Taban ≈ 30×25 m, yükseklik ≈ 18 m.

**Prompt (EN):**
> Ruined ancient Sumerian ziggurat, four receding mudbrick terraces with a long central staircase, eroded edges, collapsed corners, sand dunes covering the lower steps, buttress pillars along the walls, a broken shrine on top, sun-baked tan and ochre mudbrick with darker exposed layers, monumental silhouette readable from far away

**Türkçe açıklama:** Haritanın uzak planında yön bulmak için kullanılıyor; yakından bakılmayacak, bu yüzden siluet önemli, iç detay değil. Düşük poligon yeterli.

---

## 3. Tapınak kalıntısı B — Sütunlu salon temeli (oynanış alanı kenarı)

**Hedef:** 3.000–5.000 üçgen, 1024 doku. Alan ≈ 14×10 m, en yüksek nokta ≈ 4 m.

**Prompt (EN):**
> Ancient Mesopotamian temple foundation ruins: low broken mudbrick walls outlining rooms, a few standing sandstone columns with simple capitals and several fallen broken column drums lying on the ground, cracked stone floor slabs, a small altar block with faded cuneiform carvings, scattered rubble, dry grass growing between stones, top-down readable layout

**Türkçe açıklama:** Oyuncunun yürüdüğü alanın kenarına konacak. Duvarlar alçak kalmalı (en çok 1–1,5 m) ki kamerayı ve savaşı kapatmasın. Ortası boş ve düz olsun.

---

## 4. Kırık koruyucu heykel

**Hedef:** 2.000–3.500 üçgen, 1024 doku. Uzunluk ≈ 3,5 m, yükseklik ≈ 3,5 m.

**Prompt (EN):**
> A broken ancient Mesopotamian guardian statue carved from pale limestone: a winged bull-like creature with a crowned human head, shown in profile on a rectangular plinth, one wing snapped off, the head broken and lying on the ground beside the body, weathered surface, chipped edges, faint traces of original paint, half-buried in sand

**Türkçe açıklama:** Kırık ve devrilmiş olması önemli; savaştan kalmış hissi vermeli. Fırtına Vadisi'nde (Bozkır) daha koyu taş tonuyla bir varyasyonu da üretilebilir: promptta `limestone` yerine `dark weathered granite, storm-stained` yaz.

---

## 5. Kayalık seti (5 parça, aynı dokuyu paylaşır)

**Hedef:** Parça başı 300–900 üçgen, hepsi tek 1024 doku atlası. Boylar: 0,5 m çakıl / 1,5 m kaya / 3 m kaya / 6 m kaya duvarı / 10 m sivri kaya iğnesi.

**Prompt (EN):**
> Set of five stylized desert rock formations for a game environment: a small pebble cluster, a medium rounded boulder, a large layered sandstone rock, a wide cliff wall chunk with horizontal strata, and a tall jagged rock spire, warm sandstone with darker strata lines and wind erosion, flat-ish bottoms so they sit on terrain, consistent texel density, shared texture atlas

**Türkçe açıklama:** Aynı seti üç bölge için renk değiştirerek kullanacağız: Kıyı'da sıcak kum taşı, Bozkır'da gri-kahve fırtına kayası, Derin Edin'de siyah bazalt. Bu yüzden doku nötr olsun; oyun içinde renk tonu verilecek. İstersen bazalt için ayrı üretim:
> `...black volcanic basalt with glassy obsidian edges and faint violet mineral veins...`

---

## Oyuna ekleme notu

Modeller hazır olunca GLB dosyalarını bana gönder. Kodda her parçanın tek bir giriş noktası var (`src/ui/env/structures.js`: `makeSpiritGate`, `ziggurat`, `ruinWalls`, `brokenStatue`, `rockField`); yalnızca o fonksiyonların içi GLB yükleyecek şekilde değişecek, haritadaki yerleşim aynı kalacak.
