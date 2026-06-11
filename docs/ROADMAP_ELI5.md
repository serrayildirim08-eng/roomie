# Roomie — ELI5 Yol Haritası (çok detaylı)

_Son güncelleme: 9 Haziran 2026_

Bu doküman Roomie'nin **ne olduğunu, ne işe yaradığını, hangi özellikleri olduğunu,
bunların nasıl çalıştığını, ne ile yapılacağını, hangi sırayla ve ne kadar sürede
biteceğini** en sade dille anlatır. Kafan karışınca buraya dön.

> ⚠️ **"Neredeyim, sırada ne var?" sorusu için → [`CHECKLIST.md`](CHECKLIST.md)** (tek kaynak,
> kutucuklu). Bu dosya "ne ve neden"i anlatır; ilerleme oradan takip edilir.

> Benzetme: Roomie'yi **3 odalı bir ev inşa etmek** gibi düşüneceğiz. Önce temel,
> sonra odalar, en son akıllı sistem (kamera + beyin). Her bölümde bu benzetmeye döneceğiz.

---

## Bölüm 0 — Roomie tek cümlede

> **"Ev arkadaşlarının tüm yükünü — iş, mutfak, para — kimsenin kaybı olmadan,
> açık ve adil paylaştıran app. (Fotoğraf/OCR sadece işi kolaylaştırır, yıldız o değil.)"**

Ana amaç: **evin tüm yükünü şeffaf ve adil paylaşmak — kimse kaybetmeden.**
İki şeyi sayar:

- 💸 **Para** — kim ne harcadı, kim kime borçlu (euro).
- 🧹 **Emek** — sıra kimde (çöp/temizlik/market/yemek), kim gerçekten yaptı, kim kime iyilik yaptı.

Tek soru: _"herkes payını veriyor mu?"_ — ama **utandırmadan** (puan yok, leaderboard yok,
streak yok).

> Fotoğraf/OCR ve "tek cümle → çok yere" beyni **kolaylaştırıcıdır** (formsuz giriş),
> uygulamanın amacı değil. Amaç adil paylaşım; bunlar onu zahmetsiz yapar.

---

## Bölüm 1 — Ne bu? Kime? Neden?

### Problem (1 cümle)

Ev arkadaşları para ve iş yükünü adil paylaşmaya çalışırken sürekli sürtünme yaşar:
"sütü ben aldım", "çöpü hep ben atıyorum", "kim kime ne borçlu hatırlamıyorum" —
ve mevcut app'ler bunu ya yarım ya form-doldurma ezasıyla çözer.

### Kullanıcı (1 net kişi)

**Serra + Rotterdam'daki ev arkadaşları.** Karışık telefonlar (kimi iPhone kimi Android).
Önce biz kullanacağız (_dogfood_). Beğenirsek dışarı açacağız.

### Neden şimdi / neden biz?

- Serra zaten **Ollie**'yi yaptı: kiler, finance, Feed Me, "tek cümleyi doğru yere
  yollayan beyin" — hepsi hazır parça. Sıfırdan değil, var olanı **çok-kişiliğe** açıyoruz.
- Serra Rotterdam'a taşınıyor → gerçek bir ev, gerçek ihtiyaç, gerçek test.

### Rakiplerden farkı (araştırma özeti, 9 Haz 2026)

Piyasada 3 tip app var, hiçbiri tam değil:

| Tip | Örnek | Eksiği |
|---|---|---|
| Sadece para bölen | Splitwise, Tricount | Evi yönetmiyor |
| Sadece market listesi | OurGroceries | Parası yok, herkes tek hesaba giriyor (kimlik yok) |
| Hepsi bir arada | Flatastic, OurFlat | Her şey sığ; para Pro-paywall arkasında; iş = puan/yarış (utandırma) |

**Boşluk:** Kimse "market + para"yı *aynı anda iyi* + *öğrenen* + *formsuz* yapmıyor.
Roomie'nin kancası: **tek fotoğraf → çok yere.**

---

## Bölüm 2 — 3 oda + sihir (özellikler, nasıl çalışır)

3 oda var. Hepsi aynı "ortak deftere" (bulut) yazar, herkeste **anında** güncellenir.
Üstlerinde de iki sihir katmanı var: **Beyin** (yazıyı anlar) + **Göz** (fotoğrafı okur).

### 2.1 💸 Money odası — "kim kime ne borçlu"

**Ne yapar:** Harcamaları kaydeder, kimin kime ne kadar borçlu olduğunu hesaplar. Splitwise gibi,
ama OCR + abonelik/düzenli-ödeme takibiyle.

**Nasıl çalışır (ELI5):**
1. Biri harcama ekler: _ne için, kaç €, kim ödedi, kimler paylaşıyor._ (Ya da fişi çeker — bkz. Göz/OCR.)
2. App matematiği yapar: "Mert €30 harcadı, 3 kişiyiz → herkes Mert'e €10 borçlu."
3. Ana ekran tek bakışta gösterir: _"Sen → Mert'e €12"._
4. "Ödedim" deyince borç kapanır. (App parayı **taşımaz** — ödeme kendi aranızda;
   Tikkie vs. app dışı. v1'de ödeme entegrasyonu yok.)

**Ekstra (Splitwise'tan farkı):**
- **Abonelik takibi:** Netflix/Spotify gibi ortak abonelikler — kim ödüyor, ne kadar, ne zaman.
- **Düzenli ödeme takibi:** "X her ay kirayı öder, Y faturaları öder" gibi tekrarlayanlar.
  _(Not: kira/fatura takibinin detayı ayrıca konuşulacak — park edildi.)_

**Örnek:** Ayşe markete gitti, €24 harcadı, 3 kişilik. App: "Sen Ayşe'ye €8, Mert Ayşe'ye €8."

**Hazır parça:** Bölme matematiği Ollie finance'tan kopyalanır.

### 2.2 🍳 Kitchen odası — "dolapta ne var, ne pişsin"

**Ne yapar:** Ortak kileri takip eder + bozulmayı/alım-aralığını bilir + yemek önerir +
"ne pişsin" akışını market ve yemek sırasına bağlar.

**Nasıl çalışır (ELI5):**
1. Ortak liste: süt ✅, yumurta (3 kaldı), kahve ⚠️ bitti.
2. **Bozulma + alım-aralığı (Ollie pantry kodu):** "süt bozulmak üzere", "kahveyi ~10 günde bir
   alıyorsunuz, bitmek üzere" gibi tahminler.
3. Biri "süt bitti" der → herkes görür → biri "ben alırım" üstlenir (çift alım önlenir).
4. **Feed Me:** "Dolaptakilerle şunları yapabilirsin" diye 3 tarif önerir.
5. **"Ne pişsin" oylaması:** Ev arkadaşları 👍 basar → en çok oy = "bu akşam bu".

**Bağlı akış (kalbi burası):**
1. "Ne pişsin" oyu biter → seçilen tarif belli.
2. Tarifte **eksik malzeme** varsa → otomatik **alışveriş listesine** eklenir.
3. **Market sırası** kimdeyse → 🔔 push: _"Sıra sende, ev arkadaşların X yapmak istiyor, şunları al."_
4. **Yemek sırası** kimdeyse → 🔔 push **+ tarif**: _"Bugün sen pişiriyorsun, işte X'in tarifi."_

(Yani Kitchen, Tasks'in sıra sistemine ve bildirimlere bağlanıyor — hepsi birbirini besliyor.)

**Örnek:** Dolapta makarna + domates var, sarımsak yok → Feed Me "arrabbiata" önerir → 2 kişi 👍 →
sarımsak alışveriş listesine düşer → market sırası Mert'te → Mert'e "sarımsak al" push'u → akşam
yemek sırası sende → sana tarif push'u.

**Hazır parça:** Kiler + bozulma/alım-aralığı + Feed Me Ollie'den kopyalanır; üstüne
"çok-kişilik oy + sıra-bağlama + bildirim" eklenir.

### 2.3 🧹 Tasks odası — "sıra kimde, kim yaptı" (+ takvim + favor)

**Ne yapar:** Ev işlerini adil döndürür, kimin yaptığını sayar, müsaitliğe göre delege eder,
ve ev arkadaşlarının birbirine iyilik istemesini sağlar — hepsi **utandırmadan**.

Tasks **iki tür** iş tutar:
- **Ortak ev işleri** (çöp, banyo, mutfak — sıralı, adil döner)
- **Kişisel işler** (kendi to-do'm — ev arkadaşları görebilir, iyilik isteyebilir)

**A) Özelleştirilebilir işler:** Her evin işleri farklı → işler sabit değil, **ev kendi işlerini
tanımlar** (çöp, bulaşık, banyo, bitki sulama... ne varsa).

**B) Sıra + "kim yaptı" (ELI5):**
1. App sırayı döndürür: "bu hafta çöp → Mert, banyo → sen".
2. "Bitti" işaretlersin → sıra bir sonrakine geçer, "kim yaptı" defterine yazılır.
3. Adalet sessizce görünür: "Mert 3 kez çöp attı, sen 1 kez" → **puan/yarış yok**.

**C) Takvim + gün (küçük + büyük):**
- **Küçük (tekrarlayan gün):** "Rotterdam'da çöp günü Çarşamba" → çöp sırası sende **ve** Çarşamba
  → 🔔 push: _"Sıra sende, bugün çöp günü."_
- **Büyük (müsaitlik):** _"5–12 Temmuz yokum"_ dersin → o aralıkta sıran gelen işler **kaçmaz**,
  otomatik başkasına **delege edilir** → _"13 Temmuz dönüyorum"_ → sıraya geri katılırsın.

**D) Adil geri-ödeme:** Sen yokken Mert sıranı kapattıysa → sana **1 fazla sıra** gelir, ama
**dönüş haftan değil, bir sonraki hafta** (dönüş haftası kendi birikmiş işlerin için boş kalsın).

**E) Personal tasks + "Need a favor":**
1. Herkesin kendi sayfası: bugün ne yapacağı + kişisel işleri.
2. Ev arkadaşları birbirinin sayfasını **görebilir** ("bugün ne yapıyor bu?").
3. Birinin planını görünce **"Need a favor"** tuşuna basıp not bırakırsın:
   _"markete gidiyorsan şunu da al" / "laundromat'a gidiyorsan benimkini de götür."_
4. Karşı taraf kendi personal task'inde görür: **"X needs a favor"** → basar → notu okur → 🔔 push gider.

**Örnek:** Mert'in sayfasında "bugün markete gidecek" yazıyor → "Need a favor" → "2 litre süt al" →
Mert'e push: "Ayşe senden bir iyilik istedi."

**Yeni yazılacak:** Tasks en çok yeni-kod gereken oda (sıra motoru + takvim/delege + geri-ödeme +
personal + favor). Ollie to-do'su temel verir ama bu mantık yeni.

### 2.4 🧠 Beyin (yazı) + 👀 Göz (OCR) — odaları besleyen sihir

Bu Roomie'nin **kalbi**. Odalara form doldurmadan veri girmenin yolu.

**🧠 Beyin (yazı):** _"süt aldım 5€"_ yazarsın → beyin anlar → hem Kitchen'a (süt eklendi)
hem Money'ye (€5) yazar. Tek cümle, iki oda.

**👀 Göz (OCR — senin eklediğin sihir):** Fotoğraf çekersin/atarsın:
- **Market fişi** (Albert Heijn, Jumbo) → beyin fişi okur → "süt €1.20, yumurta €2, ekmek €1.50,
  toplam €4.70" → kalemleri **Kitchen'a**, toplamı **Money'ye** yazar, böler.
- **Ödeme ekran görüntüsü** → "X'e €30 ödedin" → otomatik Money'ye işler.

**⚠️ Güvenlik (önemli):** Fişler pisliktir (buruşuk, soluk, Hollandaca). AI bazen yanlış okur.
O yüzden **asla sessizce kaydetmez**: okur → sana _"bunlar mı? düzelt"_ küçük ekranı gösterir →
onaylarsın → kaydeder.

---

## Bölüm 3 — Ne ile yapılıyor (malzemeler) + neden

İyi haber: **neredeyse her şey bedava** (dogfood boyutunda).

| Malzeme | Ne işe yarar | Neden bu | Maliyet |
|---|---|---|---|
| **Vite + React + TypeScript** | Uygulamanın iskeleti/duvarları | Ollie ile aynı → kopya kod uyar | Bedava ✅ (kuruldu) |
| **ESLint + Prettier** | Otomatik hata yakalayıcı + düzenleyici | Tertemiz kod | Bedava ✅ (kuruldu) |
| **InstantDB** | Ortak depo: veritabanı + giriş + canlı senkron, **tek pakette** | En sade, küçük canlı app için yapılmış; Supabase+Clerk'e gerek bırakmaz | Bedava katman |
| **PWA** | Telefona koyma (link gönder, App Store yok) | iPhone + Android ikisinde de çalışır (karışık ev) | Bedava |
| **Gemini Flash (vision AI)** | Göz: fiş/ekran görüntüsü okuma | Ucuz + fişlerde iyi + Hollandaca okur | ~€0.005/fiş |
| **Groq/LLM (yazı beyni)** | Beyin: "süt aldım 5€" → odalara | Ollie'den çekilir | Kuruşlar |
| **Push bildirim** | Çöp günü, market/yemek sırası, "need a favor" uyarıları | Sıra ve favor sistemi bildirimle çalışır (PWA web-push: iOS 16.4+ ve Android destekler) | Bedava |
| **Ollie'den kopya kod** | Finance matematiği, Feed Me, kiler + **bozulma/alım-aralığı** mantığı | Sıfırdan yazmamak için | Bedava (hazır) |

**Toplam "alışveriş":** Sadece **1 ücretsiz hesap** (InstantDB) + AI kullanımı için kuruşlar.

---

## Bölüm 4 — Fazlar (sıra + süre + her fazın "bitti"si)

> ⚠️ Süreler **"iyi giderse"** tahminidir, AI-destekli marathon temposuyla, **dogfood
> kalitesi** (App Store cilası değil). Scope büyürse süre büyür (ADHD freni: yeni özellik
> = yeni süre).

> 🧭 **Altın kural:** Her oda önce **elle giriş**le çalışsın (iskelet ayakta), beyin/göz
> **sonra** takılsın. Böylece sihir takılsa bile app çalışır kalır.

### Faz 0 — Temel ✅ BİTTİ

- **Amaç:** Tertemiz zemin.
- **Yapıldı:** Repo, dil (TypeScript), ESLint, Prettier, build — hepsi yeşil, GitHub'da.
- **Bitti tanımı:** ✅ format/lint/typecheck/build geçiyor, repo'da.
- **Süre:** ~yarım gün (tamam).

### Faz 1 — Boş ev, ışıklar yanıyor

- **Amaç:** Ortak depo + giriş + canlı senkron çalışsın. (Henüz oda yok, ama temel kanıtlandı.)
- **Ne yapılır:** InstantDB kur; giriş ekranı; "ev kur + davet linkiyle katıl"; PWA olarak
  telefona eklenebilsin.
- **Bitti tanımı (4 madde):**
  1. 2 telefon aynı "evi" görüyor.
  2. Biri test verisi yazınca öbüründe **anında** çıkıyor.
  3. Davet linkiyle 3. kişi katılabiliyor.
  4. Telefona "app gibi" eklenebiliyor (PWA).
- **Süre:** ~1–2 gün.

### Faz 2 — 💸 Money odası (elle)

- **Amaç:** Harcama gir, borç gör.
- **Ne yapılır:** Harcama ekleme (ne/kaç€/kim ödedi/kimler paylaşıyor); borç hesabı;
  "kim kime €X" ekranı; "ödedim" ile kapatma. (Ollie finance matematiği kopya.)
- **Bitti tanımı:** Harcama eklenebiliyor · borçlar doğru hesaplanıyor · herkeste senkron ·
  "ödedim" borcu kapatıyor.
- **Süre:** ~2–3 gün.

### Faz 3 — 🍳 Kitchen odası (elle)

- **Amaç:** Ortak kiler + tarif önerisi.
- **Ne yapılır:** Kiler listesi (ekle/çıkar/"bitti"); "ben alırım" üstlenme; Feed Me tarif
  önerisi (Ollie kopya); tarif oylaması.
- **Bitti tanımı:** Kiler herkeste senkron · "bitti" işaretlenebiliyor · Feed Me dolaba göre
  tarif öneriyor · oy verilebiliyor.
- **Süre:** ~2–3 gün.

### Faz 4 — 🧹 Tasks odası (elle)

- **Amaç:** Adil sıra döndürme.
- **Ne yapılır:** İş tanımlama; sıra döndürme; "bitti" → sıra ilerlesin; "kim yaptı" sayacı
  (puansız).
- **Bitti tanımı:** Sıra adil dönüyor · "bitti" sırayı ilerletiyor · kim yaptı görünüyor ·
  utandırma mekaniği yok.
- **Süre:** ~2–3 gün.

### Faz 5 — 🧠 Beyin (yazı)

- **Amaç:** "süt aldım 5€" → 2 odaya otomatik.
- **Ne yapılır:** Ollie'nin L1 routing'ini çek; tek cümleyi doğru oda(lar)a yolla.
- **Bitti tanımı:** Yazılan cümle doğru odalara düşüyor · belirsizse soruyor · yanlışsa
  düzeltilebiliyor.
- **Süre:** ~2 gün.

### Faz 6 — 👀 Göz (OCR) — EN ZOR, EN SİHİRLİ

- **Amaç:** Fiş/ekran görüntüsü → odalara otomatik.
- **Ne yapılır:** Vision AI (Gemini Flash) bağla; fiş oku → kalem+toplam çıkar; **onay/düzelt
  ekranı**; onaylanınca Kitchen + Money'ye yaz.
- **Bitti tanımı:** Gerçek bir AH fişi okunuyor · kalemler+toplam çıkıyor · onay ekranı
  çalışıyor · onaylanınca 2 odaya doğru düşüyor.
- **Süre:** ~3–4 gün (fişler huysuz, en riskli).

### Faz 7 — Cila + dogfood

- **Amaç:** Gerçek kullanım, minimal UI, bug avı.
- **Ne yapılır:** Sen + ev arkadaşların gerçekten kullanır; sade UI; çıkan buglar düzelir.
- **Bitti tanımı:** Ev gerçekten 1 hafta kullandı · büyük bug yok · "bunu bırakamam" hissi.
- **Süre:** Sürekli (asıl test burada).

### 📅 Özet zaman çizelgesi

| Faz | İş | Süre (iyi giderse) |
|---|---|---|
| 0 | Temel | ✅ bitti |
| 1 | Depo + giriş + senkron | 1–2 gün |
| 2 | Money | 2–3 gün |
| 3 | Kitchen | 2–3 gün |
| 4 | Tasks | 2–3 gün |
| 5 | Beyin (yazı) | 2 gün |
| 6 | Göz (OCR) | 3–4 gün |
| 7 | Cila + dogfood | sürekli |

**Kabaca v1 dogfood'a hazır: ~2–3 hafta yoğun çalışma.** (Marathon temposunda daha hızlı olabilir.)

---

## Bölüm 5 — v1'e GİRMEYECEKLER (scope freni)

Bunlar **bilerek** dışarıda — sonra eklenir:

- ⏸️ **Kira / fatura takibi** — _park edildi, ayrıca konuşulacak_ (Money'de düzenli-ödeme
  takibinin temeli var ama kira/fatura detayı sonra).
- ❌ Ayrı sohbet / mesajlaşma modülü (favor-not'u dışında)
- ❌ Oyunlaştırma / puan / leaderboard / streak (ilke gereği **asla yarış**)
- ❌ App içi ödeme (Tikkie/iDEAL entegrasyonu) — borcu gösteririz, ödeme app dışı
- ❌ App Store / Google Play yayını (önce PWA, dogfood)

**Not — v1'e GİRDİ (önceki plandan değişti):** Takvim ("kim evde, kim yok") artık **içeride**,
çünkü adil sıra-delege için şart. Personal tasks + "need a favor" + push bildirim de eklendi.
Bunlar v1'i kalınlaştırdı → süre tahminleri büyüyecek (aşağıdaki fazlar bunu yansıtacak şekilde
ileride güncellenecek).

---

## Bölüm 6 — En muhtemel patlayacak 5 şey + minimum fix

1. **OCR fişi yanlış okur** (buruşuk/Hollandaca). → _Fix:_ Asla sessiz kaydetme; her zaman
   onay/düzelt ekranı. Fiş netse otomatik, değilse elle düzelt.
2. **Canlı senkron çakışır** (2 kişi aynı anda aynı şeyi değiştirir). → _Fix:_ InstantDB'nin
   yerleşik çakışma çözümüne güven; küçük evde nadir; "son yazan kazanır" yeterli.
3. **Ollie kodu InstantDB'ye uymaz** (Supabase'e göre yazılmıştı). → _Fix:_ Sadece *mantığı*
   (matematik, tarif) taşı, *saklama katmanını* yeniden yaz — zaten çok-kişilik için yazılacaktı.
4. **AI maliyeti beklenmedik artar.** → _Fix:_ Fiş başına maliyet kapı koy; aylık tavan;
   şüpheli artışta uyarı. (Ollie'deki cost-cap deseni.)
5. **Davet/giriş sürtünmesi** (arkadaş kuramaz, vazgeçer). → _Fix:_ Tek link + tek dokunuş;
   karmaşık kayıt yok (OurFlat'in davet-linki çıtası).

---

## Bölüm 7 — Mini sözlük (ELI5)

- **PWA:** Link'le açılan, telefona "app gibi" eklenen web uygulaması. App Store yok. iPhone+Android.
- **InstantDB:** Ortak defteri buluta koyup herkeste anında güncelleyen + girişi de halleden araç.
- **OCR:** Fotoğraftaki yazıyı okuma. (Burada: fiş okuma.)
- **Vision AI:** Resme bakıp anlayan yapay zeka. (Fişi "görüyor".)
- **L1 routing / Beyin:** Yazıyı/fişi doğru oda(lar)a yollayan akıl katmanı.
- **Dogfood:** Önce kendi kullanıp test etme.
- **Vendor/kopya kod:** Ollie'den hazır parçayı alıp Roomie'ye taşıma.
