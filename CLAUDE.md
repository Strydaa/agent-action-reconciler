# Proje
Agent'ların dış sistemlere yazma işlemlerinde "sonucu bilinmeyen" durumları
uzlaştıran açık kaynak TypeScript kütüphanesi (Agent Action Reconciler).
Her yan etki act() içinden geçer: önce claim, sonra execute, sonra sonucu yaz;
belirsizse verify ile bağımsız geri okuma; emin olunamıyorsa yeniden deneme,
unknown bırak. Sağlayıcı idempotency anahtarı destekliyorsa ctx.idempotencyKey
ile iletilir.
Durumlar: requested, accepted, verified (son, geri dönmez), unknown, failed.

# Teknoloji
Node 22, TypeScript (strict, NodeNext), better-sqlite3, vitest, tsx.
Başka bağımlılık ekleme; gerekiyorsa önce sor.

# Komutlar
- npm run typecheck
- npm test
- npm run build

# Değişmez kurallar
- Anahtar OLAYDAN türetilir (keyFrom). Zaman, rastgele değer, execution id YOK.
- Önce claim, sonra yan etki. Claim atomik olmalı (PRIMARY KEY + ON CONFLICT).
- Sonuç belirsizse körlemesine yeniden gönderme. verify yoksa unknown dön.
- "Bulunamadı" cevabı eylemin olmadığının kanıtı değildir.
- Kimlik bilgisi/token saklama YOK. payload veritabanına yalnızca hash olarak yazılır.

# Kapsam dışı (açıkça istenmedikçe ekleme)
- Kullanıcı hesabı, auth, ödeme, rol sistemi
- Web arayüzü, Next.js, Supabase, Docker
- Gerçek sağlayıcıya canlı anahtarla istek
- Yeni bağımlılık

# Çalışma biçimi
- Önce plan, onaydan sonra kod. Adım adım: iskelet, tipler, store, act(), testler.
- Her davranış değişikliğinde önce o senaryoyu yeniden üreten testi yaz.
- Her adımdan sonra `npm run typecheck && npm test`; geçmeden devam etme, "bitti" deme.
- Mevcut testleri silerek/gevşeterek geçirme.
- Emin olmadığın varsayımı koda gömme, sor.
- .env ve *.db dosyalarını commit'leme.
- Küçük, açıklayıcı commit'ler; yalnızca istendiğinde commit at.
