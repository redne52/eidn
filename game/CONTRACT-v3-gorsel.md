# Edin v3 — Görsel geliştirme sözleşmesi (müdür)

Kaynak talimat: /mnt/user-data/uploads/f082e60e-attachment.txt (kullanıcı onayladı: "ne yazıyorsa öyle"). Savaş matematiği, rules.json, kayıt biçimi, src/core DEĞİŞMEZ. Türkçe arayüz. Sahte varlık yok.

## Model/animasyon API (models.js sahibi: Ekip A)
`getModel(id, stage)` aynı kalır → `{ group, anim, meta }`.
anim (hepsi var olmak zorunda; eski adlar da çalışmaya devam eder):
- `idle(t)`, `walk(t, speed)`, `reset()`
- `attack(onImpact)` (geriye uyum = quick)
- `attackQuick(onImpact)` kısa/çevik (~0,35 sn, temas ~0,18 sn)
- `attackHeavy(onImpact)` belirgin hazırlık + güçlü darbe (~0,8 sn, temas ~0,55 sn)
- `finisher(onImpact)` yaratığa özel (~1,1 sn, temas ~0,75 sn)
- `guard(on:boolean)` savunma duruşu, `hit(heavy?)`, `dodge()`, `die()`, `victory()`
- Geçişler yumuşak (kısa blend); onImpact görsel temas anında çağrılır.
meta: `{ finisherFx: 'storm'|'poison'|'water'|'horn' | ..., impactPoint: Vector3 (yerel), height }`.
GLB: `src/ui/glb.js` — `registerGlb(id, stage, url)` + rules dışı `src/ui/assets.json` (boş liste); varsa GLTFLoader ile yükle, yükleme hatasında kod modeline düş. Gerçek GLB yok → liste boş kalır.

## Savaş görselleri ve harita (Ekip B)
battleView.js/stage.js/style.css/env/*/worldView.js. Yukarıdaki anim API'yi kullanır (henüz yoksa `anim.attackQuick || anim.attack` ile düşer).
Ayar: "Azaltılmış efekt" (kamera sarsıntısı/yakınlaşma/flaş kapalı) — settings'e kaydedilir.
