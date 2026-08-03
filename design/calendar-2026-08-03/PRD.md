# Calendar (grid) — mini-PRD (Faz 3)
2026-08-03 · status: AWAITING SIGN-OFF (Serra) · mock: ./mock.html

## Problem (1 cümle)
Evin zamanı dağınık: kira günü Money'de, misafir sohbette, çöp günü kafada —
"bu ay evde ne var"ın tek bakışlık bir yeri yok.

## Kullanıcı (1 kişi)
Serra — ayın başında bir kez bakıp "1'i kira, 12'si misafir, 15'i internet"
resmini görmek istiyor.

## Ana akış
1. Yeni **Calendar sekmesi** (5. tab, 📅): ay görünümü 7 sütunlu grid,
   bugün halkalı; ay ileri/geri okları.
2. Gün hücresinde en fazla 2 nokta: **yeşil = fatura vadesi** (bills.dueDay'den
   kendiliğinden, her ay), **altın = etkinlik** (elle eklenen).
3. Güne dokun → grid'in altında o günün listesi: "Rent €1.200 — Betül pays" /
   "Guests: Ece & Mert 🌙". Liste boşsa sakin boş-satır + "+ add".
4. **Etkinlik ekle**: güne dokun → "+ add" → ad (+ opsiyonel not) → kaydet;
   feed'e "event_added" düşer. Tek günlük, tüm-gün (v1).
5. Fatura satırına dokun → Money'ye gider (bill zaten orada yönetiliyor;
   takvim SALT-OKUR gösterir — çift yönetim yüzeyi yok).

## Data modeli
Yeni entity `events`: `name`, `date` ('YYYY-MM-DD' string — saat yok, tüm gün),
`note?`, `householdId` (gate), `createdAt` + `household` link.
Perms: view/update/delete `memberOfHousehold`, create `createsInOwnHousehold`.
Fatura vadeleri AYRI KAYIT DEĞİL — `bills.dueDay`'den her ay türetilir
(kaynak tek: Money). Chore günleri v1 dışı (gürültü riski; istenirse Faz 3.1).

## Başarı kriterleri
1. Grid doğru: ay uzunlukları, haftanın ilk günü Pazartesi, bugün işaretli.
2. Kira (dueDay=1) her ayın 1'inde yeşil nokta; bill silinince nokta kaybolur.
3. Etkinlik eklenebiliyor; diğer üye anında görüyor; feed'e düşüyor.
4. Güne dokun → o günün tam listesi; fatura satırı Money'ye götürüyor.
5. Ev-izolasyon: başka evin etkinliği görünmüyor (perms testi).
6. Ay değiştirme akıcı; 31'i olmayan ayda dueDay=31 faturası ayın son gününde.

## v1'e GİRMEYECEKLER
- Cihaz takvimi senkronu (expo-calendar) — in-app only; istenirse Faz 3.1
- Saatli/çok günlü/tekrarlayan etkinlik; davetli/katılımcı seçimi
- Push hatırlatma; chore günleri; hafta görünümü
