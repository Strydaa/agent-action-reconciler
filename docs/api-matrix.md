# API matrisi (taslak, doğrulanmamış)

Tarih: 2026-11-14. Kapsam: 20 API'nin ana yazma işlemi (oluştur / gönder).

## Nasıl hazırlandı, ne kadar güvenilir

Her API için resmî alan adlarıyla sınırlı bir web araması yapıldı. Bulgular **arama aracının özetlerinden** alındı. Sayfaların kendisi bu oturumda açılıp baştan sona okunmadı. Bu yüzden:

- "Güven" sütunu özetin ne kadar açık konuştuğunu gösterir: **yüksek** = özet açık bir cümle veriyor, **orta** = dolaylı, **düşük** = özet belirsiz ya da kuşkulu.
- "Bulunamadı", "yok" demek değildir. Arama sonucunda geçmemesi, dokümanda olmadığını kanıtlamaz.
- Bu tablo görüşmelerde veya README'de olgu olarak kullanılmadan önce her satırın kaynak sayfası elle açılıp okunmalı.
- "Geri okuma tutarlı mı" sütununda "bilinmiyor" çoğu satırda kalıyor: bu sorunun cevabı ayrı bir sayfada ve özetlerde çıkmadı.

## Matris

| API (işlem) | Anahtar desteği | Geri okuma tutarlılığı | Arama alanı / referans | Güven | Kaynak |
| --- | --- | --- | --- | --- | --- |
| Stripe (PaymentIntent oluştur) | **Var.** `Idempotency-Key` başlığı. v1'de ilk isteğin yanıtı (500 dahil) saklanır ve tekrarlarda döner. | v1'de üst düzey listeler anında tutarlı, bazı alt listeler sonradan tutarlı. v2'de listeler varsayılan olarak sonradan tutarlı. Search API'nin gecikmesi: bilinmiyor. | `metadata` | yüksek | https://docs.stripe.com/api/idempotent_requests |
| HubSpot (contact oluştur) | Belgelenmemiş (özet açıkça bir anahtar belirtmiyor). E-posta tekil kimlik görevi görür. | **Gecikmeli:** yeni nesnelerin aramada görünmesi "birkaç an" sürebilir. | e-posta, CRM Search | orta | https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm |
| Gmail API (mesaj gönder) | Bulunamadı | Bilinmiyor | `messages.list` + `q`; mesaj ID'si değişmez. SMTP ayrıca incelenmedi. | düşük | https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send |
| Slack (`chat.postMessage`) | Bilinmiyor. Özet `client_msg_id` ve "duplicate_message_not_found" hata kodlarını anıyor ama davranışı açıklamıyor. | Bilinmiyor | `conversations.history` ve mesajın `ts` değeri | düşük | https://docs.slack.dev/reference/methods/chat.postMessage/ |
| Jira Cloud (issue oluştur) | **Yok** (issue oluşturma için). `Idempotency-Key` yalnızca asenkron toplu işlem API'lerinde. | **Gecikmeli:** JQL araması varsayılan olarak yazma-sonrası-okuma tutarlılığı vermez, saniyeden dakikalara kadar gecikebilir. `reconcileIssues` parametresi (en çok 50 issue) bunu giderir. | JQL araması, `reconcileIssues` | yüksek | https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/ |
| Zendesk (ticket oluştur) | **Var.** `Idempotency-Key` başlığı. Anahtar 2 saat sonra geçersiz olur. Aynı anahtar, farklı gövde: 400 `IdempotentRequestError`. Anahtar ticket üzerinde saklanmaz, sonradan görülemez. | Bilinmiyor | Anahtarla arama mümkün değil (saklanmıyor) | yüksek | https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/ (özetteki sayfa; tam sayfa doğrulanmadı) |
| Salesforce (kayıt oluştur) | **Başlık anahtarı yok.** Dolaylı yol: external ID ile upsert (`PATCH`). Aynı external ID birden çok kayıtla eşleşirse 300 hatası. | Bilinmiyor | external ID alanı | orta | https://developer.salesforce.com/docs/platform/api-rest/guide/resources-sobject-upsert-patch.html |
| Twilio (SMS gönder) | **Doğrulanmadı.** Özet `I-Twilio-Idempotency-Token` başlığını ve 17534 "payload mismatch" hatasını anıyor. Bu iddia özetin kendisinden geliyor; kaynak cümle görülmedi. | Bilinmiyor | Mesaj SID'si | düşük | https://www.twilio.com/docs/messaging/api/message-resource |
| GitHub (issue oluştur) | Bulunamadı. İkincil hız sınırı: yazma isteklerinde en az 1 sn bekleme önerisi. | Search API gecikmesi: özet bilgi vermiyor | issue numarası; Search API (30 istek/dk) | düşük | https://docs.github.com/en/rest/issues/issues |
| SendGrid (mail gönder) | Bulunamadı | Bilinmiyor | Bilinmiyor | düşük | https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send |
| PayPal (order / payment) | **Var.** `PayPal-Request-Id` başlığı, POST ve PUT için önerilir. Özete göre 45 güne kadar saklanır. | Bilinmiyor | Order ID | yüksek | https://developer.paypal.com/api/rest/requests |
| Square (CreatePayment) | **Var.** `idempotency_key` zorunlu. Saklama süresi yayınlanmamış. | Bilinmiyor | Payment ID | yüksek | https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency |
| Shopify (Admin GraphQL) | **Kısmen.** `@idempotent` yönergesi. Stok ayarlama ve iade mutasyonlarında 2026-04 sürümünden beri zorunlu; diğer mutasyonlar için belirtilmedi. 24 saat. | Bilinmiyor | Bilinmiyor | orta | https://shopify.dev/changelog/making-idempotency-mandatory-for-inventory-adjustments-and-refund-mutations |
| Notion (sayfa oluştur) | **Yok.** Dokümana göre yazma istekleri kendiliğinden idempotent değil. 503 yanıtında `additional_data.committed_resource_id` döner, nesne bununla okunur. | Bilinmiyor | `committed_resource_id` | yüksek | https://developers.notion.com/reference/request-limits |
| Airtable (kayıt oluştur) | Başlık anahtarı bulunamadı. Dolaylı yol: `performUpsert` + `fieldsToMergeOn`. Birden çok eşleşme varsa istek başarısız. | Bilinmiyor | `fieldsToMergeOn` | orta | https://airtable.com/developers/web/api/create-records |
| Asana (görev oluştur) | Bulunamadı. Doküman POST oluşturmaların istemci tarafında idempotent yapılmasını öneriyor. | Bilinmiyor | Görev GID'i | düşük | https://developers.asana.com/docs/rate-limits |
| Intercom (contact oluştur) | Başlık anahtarı bulunamadı. Aynı kayıt tekrar oluşturulursa **409 Conflict** döner (kendiliğinden tekilleştirme). | Bilinmiyor | e-posta veya `external_id` | orta | https://developers.intercom.com/docs/references/rest-api/api.intercom.io/contacts/createcontact |
| Mailgun (mesaj gönder) | **Doğrulanmadı.** Özet "idempotency anahtarı destekleniyor" diyor ama cümle belirsiz ("additional tests"). | Olaylar en az 3 gün saklanır; Events API Logs API lehine kullanımdan kalkıyor. Gecikme: bilinmiyor. | Mailgun message id, Events/Logs | düşük | https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages |
| Postmark (mail gönder) | **Yok.** Özet açıkça "şu an desteklenmiyor" diyor. Webhook yükündeki `MessageID` ve `X-PM-Webhook-Trace-Id` ile istemci tarafında tekilleştirme öneriliyor. | Bilinmiyor | `MessageID`; Messages API | yüksek | https://postmarkapp.com/support/article/what-is-an-idempotency-key |
| Resend (mail gönder) | **Var.** `Idempotency-Key` başlığı (SMTP'de `Resend-Idempotency-Key`), en çok 256 karakter, 24 saat. | Bilinmiyor | Dönen e-posta ID'si ile alma | yüksek | https://resend.com/docs/dashboard/emails/idempotency-keys |

## Rehberdeki karar kuralına göre sayım

Kural: 20 API'nin en az 8'inde anahtar yoksa ya da geri okuma gecikmeliyse dar fikrin pazarı var.

| Kategori | API'ler | Sayı |
| --- | --- | --- |
| Anahtar **var** (yüksek güven) | Stripe, Zendesk, PayPal, Square, Resend | 5 |
| Anahtar kısmen var | Shopify | 1 |
| Kuralı **kesin** sağlayan (anahtar yok ya da gecikmeli geri okuma; güven yüksek veya orta) | Jira, Notion, Postmark, Salesforce, HubSpot | 5 |
| Başlık anahtarı **bulunamadı** (yokluk kanıtı değil) | Gmail, GitHub, SendGrid, Asana, Intercom, Airtable | 6 |
| Anahtar iddiası **doğrulanamadı** | Slack, Twilio, Mailgun | 3 |

Sonuç: kesin kanıtla **5/20**. "Bulunamadı" satırları da yokluk sayılırsa 11/20, ama bu kanıt değil, arama özetinin boşluğu. Eşik (8) bu aşamada **ne geçildi ne kaçırıldı**; karar vermek için en az 6 "bulunamadı" ve 3 "doğrulanamadı" satırının kaynak sayfasını elle okumak gerekiyor.

## Bu tablodan çıkan gözlemler (hipotez, kanıt değil)

- Ödeme ve e-posta sağlayıcılarının çoğunda (Stripe, PayPal, Square, Resend, Zendesk) anahtar var. Orada kütüphane anahtarı iletmekten fazlasını eklemiyor; benchmark da aynısını gösteriyor.
- Boşluk daha çok iş takip / CRM / bilgi aracı tarafında (Jira, Notion, HubSpot, Salesforce) ve gecikmeli aramalı sistemlerde. `verify` orada `not_done` demek yerine `unknown` dönmeli.
- Zendesk'te anahtar ticket üzerinde saklanmadığı için sonradan anahtarla arama yapılamaz. Jira'da `reconcileIssues` gibi sağlayıcıya özel bir tutarlılık mekanizması var; adaptörler bunları kullanabilir.

## Sıradaki adım

Önce 9 belirsiz satırın (Gmail, Slack, Twilio, GitHub, SendGrid, Asana, Intercom, Airtable, Mailgun) kaynak sayfasını elle açıp okumak. Sonra "Geri okuma tutarlılığı" sütununun "bilinmiyor" kalan hücreleri.
