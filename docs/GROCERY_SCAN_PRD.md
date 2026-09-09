# PRD — Grocery Scan oturumu (Faz 6, revize)

_Onaylandı: Serra, 30 Haziran 2026. OCR-fiş yerine **barkod + global DB** yönü._

## Problem (1 cümle)
Alışveriş sonrası kalemleri kilere + maliyeti borca geçirmek elle tek tek
yazınca yorucu.

## Kullanıcı (1 kişi)
Eve markedan dönmüş, poşetleri açan ev arkadaşı — telefon elinde, hızlı
bitirmek istiyor.

## Ana akış
1. Pantry'de **"Alışveriş başlat"** butonu → tarama modu açılır.
2. Kamera barkodu okur → **Open Food Facts** (ücretsiz global DB) → isim +
   kategori → anında listeye düşer.
3. Liste ekranda birikir. Bulunamayan barkod → "bulamadım, adını yaz"
   fallback'i (akışı ASLA bloklamaz).
4. En altta **"Toplam €__"** + ödeyen/bölüşen seçimi (Money'nin mevcut çipleri).
5. **"Bitir"** → kalemler Kitchen'a (`status: 'in'`), toplam Money'ye tek
   `expense` olarak bölüşülür, ev günlüğüne düşer.

## Data modeli (nerede saklanır)
- Tarama oturumu = **geçici UI state** (Bitir'e kadar hiçbir şey yazılmaz).
- Bitir'de, hepsi MEVCUT entity'lerle:
  - `pantryItems` (toplu insert, `status: 'in'`)
  - tek `expense` (toplam, eşit bölüşüm — Faz 2 motoru)
  - `purchases` log
  - `activityEvents` (ev günlüğü)
- Tek küçük şema eklemesi: `pantryItems.barcode` (opsiyonel, tekrar tanıma için).
- SKT/bozulma: **mevcut `shelfLifeDays` + kategori tahmini** kullanılır; yeni
  alan yok (Serra kararı: kesin SKT v1'de yok).

## 3 başarı kriteri (test edilebilir)
1. Gerçek paketli ürünü (örn. AH süt) okut → doğru isim+kategori listede + Kitchen'da.
2. 3 ürün okut + toplam €30 yaz → Bitir → 3'ü Kitchen'da, Money'de €30 harcama
   iki telefonda da doğru bölüşüldü.
3. Tanınmayan barkod → "adını yaz" fallback'i çıkar, oturum durmaz.

## v1'e GİRMEYECEK
- Tam **fiş-OCR** (kalem-fiyat okuma) → v1.1.
- Barkoddan fiyat (zaten imkânsız — fiyat mağazaya özel).
- Barkoddan / OCR'dan **son kullanma tarihi** → v1.1 (kategori tahmini yeter).
- Besin değeri, barkodsuz manav/fırın için özel akış (elle ekle yeter).

## Açık teknik not
Barkod okuma **cihazda native modül** gerektirir → muhtemelen **Expo Go'da
çalışmaz, dev build gerekir**. Mock'tan sonra netleştirilecek; karar koddan önce.

## Karar geçmişi
- Dump KALIR (beynin tek kapısı: kira/çöp/ampul). Grocery'ye AYRI buton. (Serra, 30 Haz)
- Hibrit yön (barkod ürün + elle/Money toplam), tam-OCR ertelendi. (Serra, 30 Haz)
