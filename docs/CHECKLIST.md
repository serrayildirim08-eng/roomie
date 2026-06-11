# Roomie — Build Checklist (TEK KAYNAK)

_Son güncelleme: 11 Haziran 2026_

Bu dosya **tek doğruluk kaynağı**: neredeyim, sırada ne var, bir şey gerçekten bitti mi.
Kafan karışınca SADECE buraya bak. Detaylı "ne/neden" için: [`ROADMAP_ELI5.md`](ROADMAP_ELI5.md).

**Kutucuk kuralları:**
- ✅ = bitti **ve telefonda test edildi**
- 🔶 = kod yazıldı ama henüz telefonda doğrulanmadı
- ⬜ = yapılmadı
- Bir maddeyi ✅ yapmak için yanındaki **"Test:"** adımını gerçekten yap. Test yapmadan ✅ yok.

> 🧭 **ŞU AN SIRADAKİ TEK İŞ → Faz 3: Kitchen (kiler + alışveriş listesi).** Money'nin 2 çip senaryosu dogfood'da kendiliğinden doğrulanacak.

---

## Faz 0 — Temel ✅ BİTTİ

- ✅ Repo + TypeScript strict + ESLint + Prettier + Expo iskeleti
- ✅ `npm run typecheck` ve `npm run lint` yeşil

---

## Faz 1 — Ev iskeleti (foundation, T0–T6)

**Amaç:** Giriş + ev + davet + canlı senkron + günlük. Odalar bunun üstüne kurulur.

- ✅ **T1 InstantDB bağlı** — şema push'landı, `db` istemcisi var
- ✅ **T2 Giriş** — Test: çık → tekrar gir → aynı hesaba düşüyorsun
- ✅ **T3 Ev kur** — Test: ev oluştur → "sahip" olarak görünüyorsun
- ✅ **T4 Davet + katıl** — Test: kodu kopyala → 2. telefon kodla aynı eve katılıyor
- ✅ **T6 Ev günlüğü** — Test: bir şey yap → öbür telefonda akışta **anında** çıkıyor

**Faz 1 BİTTİ =** ✅ (T5 izinler bilerek ertelendi → bkz. Faz 7'deki kilit maddesi).

---

## Faz 2 — 💸 Money odası (elle)

**Amaç:** Harcama gir, borcu gör, "ödedim" de.

- ✅ **Harcama ekleme** — E2E doğrulandı 11 Haz (2 gerçek hesap, web test tezgahı)
- ✅ **Borç hesabı doğru** — €30/2=€15 (E2E) + kuruş €10,01 (Serra, 2 sim, 11 Haz)
- ✅ **Senkron** — B, A'nın harcamasını + borcu anında gördü (E2E + 2 sim dogfood 11 Haz)
- ✅ **"Ödedim" (settle)** — Serra 2 simde doğruladı 11 Haz
- ✅ **🐛 Ev-arkadaşı-görünmezlik bug'ı** — E2E yakaladı, fix canlıda (instant.perms.ts: aynı evdekiler birbirini görür; commit 00ecb65). Bu fix'ten önce Money 2+ kişide tamamen bozuktu
- 🔶 **Ödeyeni seçme** — çipler canlıda; "başkası ödedi" senaryosu dogfood'da doğrulanacak
- 🔶 **Paylaşanları seçme** — çipler canlıda; "sadece ikimiz" senaryosu dogfood'da doğrulanacak
- ✅ **Gizlilik: sadece kendi borçların** — "Your balance" filtresi, Serra doğruladı (7bf19e0, 11 Haz)
- ✅ **Harcama geçmişi + silme** — Serra 2 simde doğruladı 11 Haz (sil → borçlar geri düzeldi)
- ✅ **Money matematiğine test** — vitest kuruldu, 19 test yeşil (`npm test`), €700/3 dogfood vakası dahil (11 Haz)
- 🔶 **Günlüğe düşüyor** — Test: harcama ekleyince ev günlüğünde "X harcama ekledi" çıkıyor

**Faz 2 BİTTİ =** hepsi ✅ + 2 telefonla gerçek bir market harcaması baştan sona işlendi.

### 📱 Money test senaryosu (~10 dk, sırayla yap)

Hazırlık: `npm start` → telefonda Expo Go ile aç. 2. cihaz = ikinci telefon
veya bilgisayarda simülatör. İki cihazda **farklı hesapla** gir, ikisi de aynı evde olsun.

1. ⬜ A cihazında harcama ekle: "market", €30, ödeyen sen, paylaşan 3 kişi
2. ⬜ A'da listede görünüyor → **madde 1 ✅**
3. ⬜ B cihazına bak: harcama **kendiliğinden** geldi mi (yenilemeden) → **madde 3 ✅**
4. ⬜ Borçlara bak: herkes sana €10 diyor mu?
5. ⬜ İkinci harcama: €10,01, 3 kişi → borçlar toplamı tam €10,01 mi (kuruş kaybolmuyor mu) → **madde 2 ✅**
6. ⬜ B cihazından "ödedim" işaretle → iki cihazda da borç düştü mü → **madde 4 ✅**
7. ⬜ Saçmalık dene (boş tutar, "abc", €0) → app çökmeden geri çeviriyor mu?
8. ⬜ Bitince buradaki 🔶'leri ✅ yap (ya da bana "money testleri geçti" de, ben yaparım)

---

## Faz 3 — 🍳 Kitchen odası (elle)

**Amaç:** Ortak kiler + alışveriş listesi. (Feed Me/tarif bu fazda YOK — sonra.)
**Tasarım kararları (Serra, 11 Haz):** alias tablosu VAR (süt=milk birleşir, kategori emojisi,
raf ömrü arkaplanda) · "Got it" → opsiyonel "Add to Money? €__" köprüsü VAR · bozulmada küçük
sessiz işaret VAR (puan/sayaç yok) · her "aldım" tarihiyle purchase-log'a yazılır (ileride
cadence/"bitmek üzere" tahmini bedavaya çalışsın diye — görünmez temel).

- ✅ **Kiler listesi** — E2E 11 Haz: "süt" → "milk" olarak kaydedildi (alias), tekrar "milk" eklemek kopya yaratmadı, B anında gördü
- ✅ **"Bitti" → alışveriş listesine düşer** — E2E 11 Haz
- ✅ **"Ben alırım" üstlenme** — E2E 11 Haz: A üstlendi, B "kva… is getting it" gördü
- ✅ **"Got it ✓" + Money köprüsü** — E2E 11 Haz: €4,50 girildi → Money'de "milk €4.50" + borç €2.25 doğru; kiler "var"a döndü
- 🔶 **Bozulma işareti** — kod canlı; gerçek doğrulama zaman ister (süt 7 günde solacak — dogfood'da görülecek)
- ✅ **Günlüğe düşüyor** — E2E 11 Haz: stocked/getting/got üçü de akışta

**Faz 3 BİTTİ =** hepsi ✅ + ev bir alışverişi app üzerinden döndürdü.

---

## Faz 4 — 🧹 Tasks odası (elle)

**Amaç:** Adil sıra. Utandırma yok (puan/streak/leaderboard YASAK).
**Tasarım kararları (Serra, 11 Haz):** olay bazlı dönüş ("bitti" → sıra sonrakine; hafta/takvim
yok) · cezasız Pass VAR (sıra devredilir, not düşülmez) · herkes Done diyebilir (emek yapanın
adına yazılır, sıra yine ilerler) · "kim yaptı" = SADECE kronolojik geçmiş listesi (sayı bile yok).

- ✅ **İş tanımlama** — E2E 11 Haz: "trash" eklendi, B anında gördü, ilk sıra ilk üyede
- ✅ **Sıra motoru** — E2E 11 Haz: Done → sıra A'dan B'ye iki ekranda da geçti
- ✅ **Pass** — E2E 11 Haz: cezasız devir, günlükte yumuşak dil ("moved on from")
- ✅ **Sıra dışı Done** — E2E 11 Haz: sıra A'dayken B kapattı → emek B'ye yazıldı, sıra ilerledi
- ✅ **Geçmiş listesi** — E2E 11 Haz: kronolojik, sayısız ("tvb passed · You did it")
- ✅ **Günlüğe düşüyor** — E2E 11 Haz: added/did/passed üçü de akışta (not: 2 Done'dan 1'i sayıldı test anında — büyük olasılık senkron gecikmesi, dogfood'da izlenecek)

**Faz 4 revizyonu (Serra dogfood feedback'i, 11 Haz akşam):**
- ✅ **Mine = aksiyon listesi** — sıran gelen ev işleri + kişisel işler tek yerde; House = kalanlar (E2E ✓)
- ✅ **Yeni iş ekleyende başlar** — member[0] yığılması bitti (E2E ✓)
- ✅ **Turn pill** — alt yazı yerine sağda tek pill (terracotta "Your turn" / soluk isim)
- ✅ **Kişisel görevler (personalTasks)** — sadece sahibi görür (E2E: B göremedi ✓), Done → kaybolur, günlüğe yazılmaz; "need a favor" için household'a bağlı
- ✅ **Hazır yüklü işler** — yeni ev: Trash/Dishes/Bathroom/Floors otomatik (E2E ✓); eski ev: "+ Add the classics" tek-dokunuş linki (hepsi varken gizleniyor — E2E ✓)

**Faz 4 fiilen BİTTİ** (1 hafta gerçek çöp/banyo dogfood'u kalan tek madde).

**Faz 4 BİTTİ =** hepsi ✅ + 1 hafta gerçek çöp/banyo sırası app'ten döndü.

> Takvim + müsaitlik + delege + geri-ödeme + personal tasks + favor → **Faz 4'te DEĞİL**,
> dogfood'dan sonra (aşağıda "Sonrası" listesinde). Scope freni.

---

## Faz 5 — 🧠 Beyin (yazı)

**Amaç:** "süt aldım 5€" → tek cümle, doğru odalara taslak.
**Tasarım kararları (Serra, 11 Haz):** kutu Home'un tepesinde · 4 hedef birden (Money/Kitchen/
Tasks/Mine) · ayrı Roomie worker'ı (roomie-brain.ollieapp.workers.dev) · eski Groq anahtarı
kullanılıyor, beta kapısında rotasyon.

- ✅ **LLM routing** — Groq JSON modu + CF Workers AI yedeği + zod kurtarıcı parser (E2E 7/7: TR/EN karışık, çoklu parça)
- ✅ **Taslak + onay** — E2E: "süt aldım 5€" → kart → Confirm → Kitchen'a milk + Money'ye €5.00 düştü; Confirm'süz hiçbir yazma yok
- ✅ **Belirsizse soruyor** — E2E: "bugün market ödedim" → "🧠 Kaç € tuttu?" — tahmin uydurmuyor
- ✅ **Maliyet kapısı** — günlük çağrı tavanı (200) + token sınırı; Voyage önbellek bilerek ertelendi
- 🔶 **Sim/telefonda gerçek dogfood** — web E2E 8/8; Serra'nın elinde denenecek

**Faz 5 BİTTİ =** hepsi ✅ + 3 farklı gerçek cümle doğru işlendi (E2E'de 7 cümle ✓; dogfood onayı kaldı).

---

## Faz 6 — 👀 Göz (OCR) — en zor, en sihirli

**Amaç:** AH/Jumbo fişi → kalemler Kitchen'a, toplam Money'ye.

- ⬜ **Foto çek/seç → Gemini Flash'a yolla**
- ⬜ **Fiş parse** — kalemler + toplam çıkıyor
- ⬜ **Onay/düzelt ekranı** — Test: yanlış okunan kalemi elle düzeltebiliyorsun
- ⬜ **Onayla → 2 odaya yaz** — Test: gerçek bir AH fişi baştan sona: foto → onay → Kitchen + Money doğru
- ⬜ **Maliyet kapısı** — fiş başına + aylık tavan

**Faz 6 BİTTİ =** hepsi ✅ + 3 gerçek (buruşuk dahil) fiş doğru işlendi.

---

## Faz 7 — Cila + dogfood 🏁

**Amaç:** Rotterdam evi gerçekten kullanıyor.

- ⬜ **🔐 T5 İzinler (`instant.perms.ts`)** — EV ARKADAŞLARI KATILMADAN ÖNCE şart. Kural: sadece ev üyesi o evin verisini görür. Test: yabancı hesap ev verisini göremiyor + üyeler her şeyi görüyor
- ⬜ Ev arkadaşları telefonlarına kurdu (Expo Go veya dev build)
- ⬜ 1 hafta kesintisiz gerçek kullanım
- ⬜ Çıkan buglar listelendi + kapatıldı
- ⬜ "Bunu bırakamam" hissi — ev app'siz alışveriş/borç döndürmek istemiyor

---

## Sonrası (v1'e GİRMEZ — buraya yazılır, şimdi YAPILMAZ)

Yarı yolda aklına gelen her fikir önce buraya. Faz bitmeden yukarı taşınmaz.

- Takvim + müsaitlik + delege + adil geri-ödeme
- Personal tasks + "need a favor"
- Push bildirimler (sıra sende / çöp günü)
- Feed Me tarif önerisi + "ne pişsin" oylaması
- Settlement çift-taraflı onay ("ödedim" → karşı taraf "aldım" der)
- Eşit olmayan bölüşme (yüzde / pay / "ben içmedim" hariç tutma)
- Harcama düzenleme (silmek yerine düzeltme)
- Abonelik / düzenli ödeme takibi · kira/fatura (park)
- App Store / Play yayını
- Roomie → Ollie köprüsü (tek yönlü: ev olayları Ollie'nin E-kaynaklarına beslenir; aynı Clerk kimliği + home diary olay kaynağı hazır)
