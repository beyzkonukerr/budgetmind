# TUBITAK Uygunluk Notlari (2209-A)

Bu dokuman, projenin bilimsel ve etik acidan izlenebilirligini desteklemek icin hazirlanmistir.

## 1) Modelin Acikligi ve Tekrarlanabilirlik

- Kullanilan denklem:
  - `FSI = 0.55*stressNorm + 0.25*budgetPressure + 0.20*behaviorRisk`
- Esik degerler:
  - Dusuk `<0.40`, Orta `0.40-0.59`, Yuksek `>=0.60`
- Model metadatasi:
  - `GET /api/meta/model` endpointi ile sunulur.

## 2) Veri Minimizasyonu ve Acik Riza

- Analiz endpointi `consent=true` olmadan veri islemez.
- E-posta alani opsiyoneldir.
- Toplanan veri analiz amaciyla sinirlidir (gelir/harcama/stres/davranis parametreleri).

## 3) Guvenlik ve Yetkilendirme

- Rol bazli erisim: `admin`, `analyst`, `viewer`
- JWT + HttpOnly cookie oturumu
- Basarisiz login denemelerinde lock mekanizmasi
- Parola guclendirme ve hashleme (scrypt + salt)

## 4) Denetlenebilirlik (Audit Trail)

- Asagidaki aksiyonlar loglanir:
  - LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT
  - PASSWORD_CHANGED_SELF
  - USER_CREATED, USER_UPDATED, USER_DELETED
- Audit loglar filtrelenebilir ve CSV olarak disa aktarilabilir.

## 5) Operasyon ve Surdurulebilirlik

- DB yedekleme komutu: `npm run backup:db`
- Hizli dogrulama testi: `npm test`

## 6) Istatistiksel Analiz (SPSS benzeri ciktilar)

Uygulama icinde:

- Betimleyici istatistikler (ortalama, medyan, standart sapma, min-max)
- Pearson korelasyon matrisi
- En kucuk kareler (OLS) coklu dogrusal regresyon: FSI tahmini
- Basit dogrusal regresyonlar (FSI ile degiskenler arasi)
- Risk seviyesine gore FSI grup ortalamalari

Endpoint ozeti: `README.md` dosyasindaki **Istatistiksel Analiz API** bolumune bakiniz.

## 7) Karar Destek ve Senaryo Analizi (What-If)

- **Icgoru endpointi** (`GET /api/admin/analytics/insights`): secilen veri kumesi uzerinde KPI, risk segment karsilastirmasi, trend sinyali, erken uyarilar ve onerilen aksiyonlar uretir.
- **Aksiyon skoru**: tanımlı esiklere gore 0-100 araliginda ozet bir oncelik gostergesidir; akademik bir "risk skoru" degil, yonetim paneli yardimcidir.
- **Senaryo simulasyonu** (`POST /api/admin/analytics/simulate`): bütçe baskisi ve stres bilesenlerine yuzde carpani, davranis skoruna mutlak duzeltme uygulanir; FSI model denklemi ile yeniden hesaplanir ve risk sinifi esikleri tekrar uygulanir. Sonuc, mevcut veri ile **karsilastirmali** (baseline vs simulated) sunulur.
- Metodoloji metni API yanitinda (`methodology`) acik metin olarak doner; raporlamada kopyalanabilir.
