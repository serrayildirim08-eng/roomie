# Roomie — Temel (Foundation) Yol Haritası (ELI5)

_Son güncelleme: 9 Haziran 2026_

Bu, modüllerden (Money / Kitchen / Tasks) **önce** kurulması gereken iskeletin planıdır.
Tam ürün planı için bkz. [`ROADMAP_ELI5.md`](ROADMAP_ELI5.md). Ollie'den ne çekileceği için
bkz. [`OLLIE_REUSE_AUDIT.md`](OLLIE_REUSE_AUDIT.md).

## "Temel" nedir? (ELI5)

Para/mutfak/sıra = **odalar**. Temel = o odaların üstünde durduğu **ev iskeleti**:

🚪 kapı (giriş) · 🏠 evin kendisi (household) · 👥 arkadaşı içeri alma (davet) ·
🔐 kim neyi görür (izinler) · 📔 ev günlüğü (olan biten).

Bunlar olmadan modül yapmanın anlamı yok — çünkü "ortak" olan her şey bir **eve** ait olmalı.

## Fazlar

| Faz | Ne | Durum |
|---|---|---|
| **T0** | 🏗️ İskelet — Expo + React Native + TypeScript (strict) + ESLint + Prettier | ✅ bitti |
| **T1** | 🗄️ Ortak defter — InstantDB bağlı (şema: ev/üye/aktivite + `db` istemcisi) | ✅ bitti |
| **T2** | 🚪 Giriş — "sen kimsin" (kimlik) | ⬜ sıradaki |
| **T3** | 🏠 Ev kur — household oluştur, kuran kişi "sahip" olur | ⬜ |
| **T4** | 👥 Davet + katıl — davet linki, roller (sahip / üye) | ⬜ |
| **T5** | 🔐 İzinler — sadece o evin üyeleri o evin verisini görür/yazar | ⬜ |
| **T6** | 📔 Ev günlüğü — "Mert çöpü attı", "Ayşe süt ekledi" akışı | ⬜ |
| — | 📱 App kabuğu — alt sekmeler / ana ekran / temel düzen (yol boyunca eklenir) | ⬜ |

## Her fazın "bitti" tanımı

- **T2 Giriş:** Bir kişi giriş yapabiliyor, çıkış yapabiliyor, tekrar girince aynı hesaba düşüyor.
- **T3 Ev kur:** Giriş yapmış kişi bir ev oluşturabiliyor ve onun "sahibi" oluyor.
- **T4 Davet:** Davet linkiyle ikinci kişi aynı eve katılabiliyor; roller ayrışıyor.
- **T5 İzinler:** Ev üyesi olmayan kimse o evin verisini göremiyor; eve özel izole.
- **T6 Günlük:** Evde olan önemli şeyler herkesin gördüğü tek bir akışta beliriyor.

## TEMEL BİTTİ — done-definition

👉 **İki kişi aynı eve girip aynı veriyi canlı görebildiğinde.**
(Biri bir şey yazınca öbürünün ekranında anında çıkıyor.)

O an temel hazır → odalara (Money → Kitchen → Tasks) geçilir.

**Süre:** İyi giderse ~1–2 gün (T2–T6 birer küçük parça).

## Kural (spec'ten)

- Her ortak kayıt bir **household_id**'ye bağlı olmalı (eve izole).
- AI/OCR çıktısı asla sessizce kaydedilmez — önce taslak, sonra onay (sonraki fazlar).
- Utandırma yok: puan/streak/leaderboard yok.
