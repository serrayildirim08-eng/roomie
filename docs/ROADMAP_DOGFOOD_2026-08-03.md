# Roomie Dogfood Roadmap — 2026-08-03

DURUM (2026-08-03 gece): Faz 0 ✅ · Faz 0.5 ✅ · Faz 1 ✅ · Faz 2.1 ✅ · Faz 2.2 ✅
(hepsi `feat/dogfood-fixes-faz0`, cihaza inmesi build 6 bekliyor) · Faz 2.3 OCR:
native modül kararı bekliyor (build gerektirir) · Faz 3 takvim: sırada.

Kaynak: Serra + Betül dogfood'u (TestFlight 0.1.0 (5) canlı). Sıralama kuralı:
önce dogfood'u kıran şeyler, sonra mevcut modeli büyütenler, en son yeni altyapı.

---

## Faz 0 — Dogfood tamiri (tartışmasız, tek PR)

### 0.1 Chore "done" butonu çalışmıyor (BUG)
- Şüphe: PR #18 perms sıkılaştırması chore update'ini sessizce reddediyor
  (InstantDB perm reddi UI'da hata göstermez).
- **Done:** Betül'ün telefonunda done'a basınca chore kapanıyor, activity feed'e
  "chore_done" düşüyor, perm reddi olursa UI'da görünür hata var.

### 0.2 Pantry'ye manuel ekleme
- Tek "add item" formu (ad + kategori + opsiyonel adet). Barkodsuz/dump'sız yol.
- **Done:** Dükkanda 10 saniyede elle ürün eklenebiliyor; eklenen ürün doğru
  başlıkta görünüyor; brain-dump yolu bozulmadı.

### 0.3 Pantry sorting: elle taşı + öğren
- (a) kategori eşleme sözlüğü genişletilir; (b) asıl fix: yanlış başlıktaki
  ürünü elle doğru başlığa taşıma affordance'ı + bu düzeltmenin kalıcı
  öğrenilmesi (aynı ürün bir daha şaşmaz).
- **Done:** Yanlış kategorideki bir ürün 2 dokunuşla taşınıyor; aynı ürün
  sonraki eklemede doğru başlığa gidiyor; taşıma activity feed'e düşmüyor (gürültü).

## Faz 0.5 — "I'll get it" v2: üstlenme + çakışma çözümü (küçük model değişikliği)

Senaryolar:
1. A "I'll get it" dedi → item A'nın **task listesinde** "alışveriş sözün" olarak görünür.
2. A üstlendi ama **B aldı** → B item'da "ben aldım" diyebilir → item kapanır,
   **A'ya bildirim**: "B aldı, senin almana gerek yok."
- Model: item'a `claimedBy` yanına `boughtBy` + kapanış durumu; bildirim kanalı
  minimum in-app (activity feed + rozet), push varsa push (expo-notifications
  kurulu mu → Faz 0.5 başında kontrol edilecek; yoksa v1 in-app, push ayrı iş).
- **Done:** A üstlenir → A'nın task listesinde görünür; B "ben aldım" der →
  item kapanır + A bildirim görür; ikisi de aynı anda alırsa çift kayıt oluşmaz
  (idempotent kapanış); activity feed'de tek satır.

## Faz 1 — Subscriptions & monthly bills (mini-PRD ✍️ + mock → sign-off → kod)

- KARAR (Serra, 2026-08-03): faturalar/abonelikler **split'e girer** — kim
  ödüyor, nasıl bölüşülüyor money'nin mevcut fairness/split mekanizmasına bağlanır.
- Kapsam taslağı: tekrarlayan kayıt (ad, tutar, para birimi, gün, kim ödüyor,
  bölüşüm), aylık toplam başlığı, vade yaklaşınca görünürlük (→ Faz 3 takvimi besler).
- Açık soru (PRD'de): "ödendi" işareti dönem bazlı mı tutulur; ödeyen değişince
  denge nasıl güncellenir.
- **Done (taslak):** Kira + 2 abonelik girilebiliyor; ana para ekranında aylık
  toplam; her kayıtta kim-öder/bölüşüm görünür; split bakiyesi doğru değişiyor;
  vade tarihi takvim verisi olarak okunabiliyor.

## Faz 2 — Görsel kanıt katmanı (sıra: 2.1 → 2.2 → 2.3, aynı altyapı)

### 2.1 Task güncellemesine foto + not → activity feed
- Foto çekme/yükleme altyapısını bu kurar (InstantDB $files).
### 2.2 Receipt Gallery
- Aynı depolamanın üstüne fiş galerisi (tarih sıralı, item'a/harcamaya bağlanabilir).
### 2.3 Receipt OCR + itemize
- OCR cihaz-içi (Apple Vision, bedava/offline) → metin; itemize LLM ile →
  pantry'ye ürünler + money'ye tutar önerisi ("onayla" akışıyla, otomatik yazma yok).
- **Done (taslak):** Fiş fotoğrafı → 5 sn içinde kalem listesi önerisi →
  onaylananlar pantry+money'ye işlenir; yanlış kalem tek dokunuşla düzeltilir.

## Faz 3 — Calendar (grid) 📅

- KARAR (Serra, 2026-08-03): **takvim grid'i** istenilen — payment dates
  (Faz 1'den beslenir) + ev etkinlikleri.
- Bu yüzden sıra Faz 1'den SONRA: fatura vadeleri olmadan takvim boş doğar.
- Kapsam taslağı: ay görünümü grid; gün hücresinde nokta/etiket; kaynaklar:
  bill vadeleri, chore günleri (opsiyonel), elle etkinlik ("misafir geliyor").
- PRD'de karar: cihaz takvimine yazma (expo-calendar) var mı, yoksa sadece in-app mi.

---

## Sıralama özeti
1. **Faz 0** (bug + pantry×2) — hemen, tek PR
2. **Faz 0.5** ("I'll get it" v2 + bildirim) — hemen ardından
3. **Faz 1** (bills+split) — mini-PRD + mock, sign-off sonrası
4. **Faz 2** (foto→galeri→OCR) — üçü sırayla, tek altyapı
5. **Faz 3** (takvim grid) — Faz 1'e bağımlı

V1'e GİRMEYECEKLER (bu turda): push notification altyapısı Faz 0.5 için şart
değilse ayrı iş; cihaz takvimi senkronu; fiş OCR'ında otomatik (onaysız) yazma;
pantry'de stok adedi takibi genişletmesi.
