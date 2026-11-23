# Edin — çalışma kuralları (Codex, Claude ve diğer ajanlar için)

Önce README.md, sonra game/CONTRACT*.md, game/PLAN-v4.1-cekirdek.md, game/NOTES-*.md ve TESLIM-v4.1.md dosyalarını oku.

- Oyun: Three.js tarayıcı oyunu (Godot değil). Kod: game/src. Derleme çıktısı: game/dist/index.html (tek dosya).
- Bütün oyun sayıları game/src/data/rules.json'da; koda sayı gömme. data/rules.json aynı dosyanın kopyasıdır, ikisini birlikte güncelle.
- game/src/core içinde DOM veya Three.js kullanma (saf oyun mantığı).
- v2 savaş matematiğini (combat.js) izinsiz değiştirme. Denge değişikliği simülasyonla (game/tools) kanıtlanmalı.
- Kayıt uyumu: eski kayıtlar açılmalı (game/src/core/migrate.js); işlemler idempotent kalmalı.
- Arayüz dili Türkçe.
- Her değişiklikten sonra: `cd game && npm install && npm test && npm run build`. Testler geçmeden birleştirme yapma.
- Ana dala (main) doğrudan itme; her iş için ayrı dal + pull request aç; açıklamaya ne değiştiğini ve test sonuçlarını yaz.
