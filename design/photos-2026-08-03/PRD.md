# Görsel kanıt katmanı (Faz 2) — mini-PRD
2026-08-03 · status: AWAITING SIGN-OFF (Serra) · mock: ./mock.html
Sıra sabit: 2.1 foto+not → 2.2 fiş galerisi → 2.3 OCR. Üçü tek altyapı
(InstantDB $files) — 2.1 temeli döşer, gerisi üstüne oturur.

## Problem (1 cümle)
"Yaptım" ve "aldım" sözle kalıyor: temizlenen mutfağın, ödenen faturanın,
alınan fişin görsel kaydı yok — güven ve hafıza sohbete emanet.

## Kullanıcı (1 kişi)
Betül — bulaşığı boşalttığını söylemek yerine fotoğrafını bırakmak,
markete gidince fişi çekip unutmak istiyor.

## 2.1 — Task'a foto + not → activity feed
Akış: chore detayında (mevcut ChoreDetail) **"add a photo"** → kamera veya
galeri → opsiyonel kısa not → Done akışı değişmez; foto `choreEvents`'in
yanına değil, feed olayına bağlanır: feed satırında küçük thumbnail + not,
dokununca tam ekran.
- Data: `$files` (Instant storage) + `activityEvents ↔ $files` link (`photo`),
  `metadata.note`. Upload yolu: `expo-file-system` File + `db.storage.uploadFile`
  (Instant'ın SDK-56 belgeli yolu). Yeni bağımlılık: `expo-image-picker`,
  `expo-file-system` (ikisi de resmî Expo paketi; gerekçe: Instant'ın RN upload
  sözleşmesi + kamera/galeri seçici).
- $files perms: path konvansiyonu `households/{householdId}/...` → view/create
  kuralı path-prefix'i auth'un ev(ler)iyle eşleştirir (docs: kural yalnız
  `data.path` görür). Delete: v1'de kapalı (feed append-only ile tutarlı).
- **Done:** chore'a foto+not eklenebiliyor; feed satırında thumbnail + not;
  dokununca tam ekran; foto olmadan akış bugünkü gibi; upload hatası yumuşak
  ve metin kaybetmiyor; foto başka evin üyesine GÖRÜNMÜYOR (perms testi).

## 2.2 — Receipt Gallery
Akış: Money'de "Receipts" girişi → ay bazlı ızgara (expo-image thumbnail);
fiş = `receipts` entity ($files link + opsiyonel `expense` link + createdAt).
Fiş çekme: Money'de "📷 fiş" butonu → foto → (varsa) harcamaya bağla.
- **Done:** fiş çekilip galeride görünüyor; harcamaya bağlanan fiş, harcama
  satırından açılıyor; galeri ay başlıklarıyla sıralı; ev-izolasyon perms testi.

## 2.3 — Receipt OCR + itemize
Akış: galerideki fişte **"read it"** → cihaz-içi OCR (Apple Vision,
`VNRecognizeTextRequest` — bedava/offline; Expo native modül veya
react-native-vision-text tipi köprü: kod aşamasında VERIFY) → ham metin →
LLM itemize (mevcut brain worker'a `/receipt-itemize` ucu) → onay listesi:
her kalem işaretli, düzeltilebilir → onaylananlar pantry'ye ürün + toplam
tutar money'ye harcama önerisi. **Onaysız hiçbir yazma yok.**
- **Done:** örnek market fişi → ≤5 sn'de kalem listesi; kalem düzeltme tek
  dokunuş; onay → pantry + money'de doğru kayıtlar; OCR/LLM hatasında ham
  metin gösterilir, akış ölmez; consent: fiş metni PII scrub'sız LLM'e
  gitmez (isim/kart hanesi maskesi worker'da).

## v1'e GİRMEYECEKLER (bu faz)
- Video, çoklu foto/olay (tek foto), foto düzenleme/kırpma
- Foto silme (append-only feed ile tutarlı; yanlışsa Serra admin siler)
- OCR'da otomatik fiyat-ürün eşleştirmeden pantry fiyat takibi
- Push bildirim ("fotoğraf eklendi" sessiz kalır — feed yeter)
