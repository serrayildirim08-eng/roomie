# Bills & Subscriptions — mini-PRD (Faz 1)
2026-08-03 · status: AWAITING SIGN-OFF (Serra) · mock: ./mock.html

## Problem (1 cümle)
Kira ve abonelikler her ay görünmez biçimde tekrar eder; kim ödüyor / nasıl
bölüşülüyor her ay yeniden hatırlanmak zorunda ve split defterine elle girilmezse
adalet matematiğinin dışında kalır.

## Kullanıcı (1 kişi)
Betül — Rotterdam evinde kirayı kendi hesabından ödeyen kişi; ay sonunda
"kim bana ne kadar borçlu"nun kendiliğinden doğru çıkmasını istiyor.

## Ana akış
1. Money sekmesinde yeni **Bills** bölümü: satır başına ad · tutar · vade günü ·
   kim öder · kaça bölünür; başlıkta **aylık toplam**.
2. **Add bill**: ad, tutar (EUR), ayın günü (1–31), payer (üye seçici),
   participants (varsayılan: herkes; alt küme seçilebilir). Eşit bölüşüm — v1'de
   oran yok (mevcut expense matematiğiyle bire bir aynı).
3. Ayı gelince satırda **"Paid ✓"**: dokununca o ay için NORMAL bir expense
   damgalanır (paidBy=payer, participants=seçili küme) → mevcut
   `computeNetCents` adaleti kendiliğinden işler, feed'e "bill paid" düşer.
4. Aynı ay ikinci "Paid" engellenir (`lastPaidPeriod === 'YYYY-MM'` kontrolü);
   buton o ay "Paid Aug ✓" pasif haline döner.
5. Vadesi ≤7 gün kalan satır üstte, sakin bir "due soon" pili ile (nag yok).

## Data modeli (nerede saklanır)
Yeni entity `bills` — InstantDB:
- alanlar: `name`, `amountCents`, `currency:'EUR'`, `dueDay:1–31`,
  `lastPaidPeriod?:'YYYY-MM'`, `householdId` (create-rule gate — AGENTS.md
  dersi), `createdAt`, `updatedAt`, `archivedAt?`
- linkler: `household`, `paidBy→$users`, `participants→$users (many)`
- perms: view/update/delete `memberOfHousehold`, create `createsInOwnHousehold`
- "Paid" damgası AYRI tablo İSTEMEZ: sıradan `expenses` satırı doğurur
  (metadata.billId ile geriye izlenebilir). Bakiye makinesine sıfır dokunuş.

## Başarı kriterleri (test edilebilir)
1. Kira + 2 abonelik girilebiliyor; Bills başlığında aylık toplam doğru.
2. "Paid ✓" → Money bakiyeleri expense'le birebir aynı değişiyor; feed'de
   "Betül paid Rent €1200" satırı.
3. Aynı ay ikinci kez Paid basılamıyor; yeni ayda buton kendiliğinden açılıyor.
4. Payer/participants düzenlenebiliyor; sonraki damga yeni ayarla doğuyor.
5. Bill silme: geçmiş expense'lere DOKUNMAZ (defter bozulmaz), satır gider.
6. Vadesi yaklaşan satır "due soon" ile üstte görünüyor.

## v1'e GİRMEYECEKLER
- Otomatik damga (onaysız expense) ve push hatırlatma — Faz 3 takvimi + ayrı iş
- Oransal/kısmi bölüşüm; EUR dışı para birimi
- Ödeme geçmişi ekranı (feed + expenses zaten kayıt)
- Fatura tutarı ay bazında değişkenlik (elektrik gibi) — damga anında tutar
  düzeltilebilir (tek dokunuş edit), ayrı "variable bill" tipi yok
