# Roomie — Build Checklist (TEK KAYNAK)

_Son güncelleme: 11 Haziran 2026_

Bu dosya **tek doğruluk kaynağı**: neredeyim, sırada ne var, bir şey gerçekten bitti mi.
Kafan karışınca SADECE buraya bak. Detaylı "ne/neden" için: [`ROADMAP_ELI5.md`](ROADMAP_ELI5.md).

**Kutucuk kuralları:**
- ✅ = bitti **ve telefonda test edildi**
- 🔶 = kod yazıldı ama henüz telefonda doğrulanmadı
- ⬜ = yapılmadı
- Bir maddeyi ✅ yapmak için yanındaki **"Test:"** adımını gerçekten yap. Test yapmadan ✅ yok.

> 🧭 **ŞU AN SIRADAKİ TEK İŞ → Faz 2: Money'yi 2 telefonda test et (🔶'leri ✅ yap).** Başka şeye bakma.

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
- ⬜ **Ödeyeni seçme** — varsayılan "ben", ama Mert ödediyse Mert seçilebilir. Test: "Mert ödedi" gir → borçlar Mert'e doğru çıkıyor
- ⬜ **Paylaşanları seçme** — varsayılan "tüm ev", ama "sadece ikimiz" seçilebilir. Test: 2 kişilik harcama → 3. kişi borçlanmıyor
- ✅ **Harcama geçmişi + silme** — Serra 2 simde doğruladı 11 Haz (sil → borçlar geri düzeldi)
- ⬜ **Money matematiğine test** — `money-logic.ts` pure; vitest kur, `computeNetCents` + `simplifyDebts` + `parseAmountToCents` için ~10 test. Test: `npm test` yeşil
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

- ⬜ **Kiler listesi** — ekle / çıkar / "bitti" işaretle. Test: süt ekle → herkeste görünüyor
- ⬜ **"Bitti" → alışveriş listesine düşer** — Test: sütü "bitti" yap → alışveriş listesinde
- ⬜ **"Ben alırım" üstlenme** — Test: bir kalemi üstlen → diğer telefonda "X alacak" görünüyor (çift alım önlenir)
- ⬜ **Günlüğe düşüyor** — Test: "kahve bitti" → günlükte

**Faz 3 BİTTİ =** hepsi ✅ + ev bir alışverişi app üzerinden döndürdü.

---

## Faz 4 — 🧹 Tasks odası (elle)

**Amaç:** Adil sıra. Utandırma yok (puan/streak/leaderboard YASAK).

- ⬜ **İş tanımlama** — ev kendi işlerini ekler (çöp, banyo...). Test: iş ekle → herkeste görünüyor
- ⬜ **Sıra motoru** — Test: işi "bitti" yap → sıra otomatik sonraki kişiye geçiyor
- ⬜ **"Kim yaptı" defteri** — Test: geçmişte kim ne yaptı listeleniyor (sayı var, puan/sıralama yok)
- ⬜ **Günlüğe düşüyor** — Test: "Mert çöpü attı" günlükte

**Faz 4 BİTTİ =** hepsi ✅ + 1 hafta gerçek çöp/banyo sırası app'ten döndü.

> Takvim + müsaitlik + delege + geri-ödeme + personal tasks + favor → **Faz 4'te DEĞİL**,
> dogfood'dan sonra (aşağıda "Sonrası" listesinde). Scope freni.

---

## Faz 5 — 🧠 Beyin (yazı)

**Amaç:** "süt aldım 5€" → tek cümle, doğru odalara taslak.

- ⬜ **LLM routing** (Ollie L1'den uyarla) — cümle → hangi oda(lar) + alanlar
- ⬜ **Taslak + onay** — AI asla sessiz kaydetmez. Test: "süt aldım 5€" yaz → onay kartı çıkıyor → onayla → Kitchen'a süt + Money'ye €5 düşüyor
- ⬜ **Belirsizse soruyor** — Test: "bi şeyler aldım" → app tahmin uydurmuyor, soruyor
- ⬜ **Maliyet kapısı** — günlük/aylık AI tavanı var

**Faz 5 BİTTİ =** hepsi ✅ + 3 farklı gerçek cümle doğru işlendi.

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
