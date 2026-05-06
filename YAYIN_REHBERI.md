# BudgetMind — İnternete tam uygulama yayını (her şey bir arada)

Bu rehber, **anket + API + yönetim paneli + SQLite kayıtlar**ın hepsinin internette çalışması içindir.

> **Önemli:** [Vercel](https://vercel.com) bu proje için **tam sürüm değildir** (sunucu + veritabanı birlikte yok). Tam sürüm için aşağıdaki **Railway** adımlarını kullanın.

---

## Sizden gerekenler (özet)

| Ne | Neden |
|----|--------|
| Bir **e-posta** (tercihen Gmail) | GitHub ve Railway hesabı için |
| **GitHub** hesabı | Kodun internette durması için |
| **[Railway](https://railway.app)** hesabı | Sunucunun 7/24 çalışması için |
| İsteğe bağlı: **kredi kartı** | Railway ücretlendirme politikasına göre (deneme kredisi sonrası) |

Kod tarafında gerekli dosyalar repoda hazır: `Dockerfile`, `railway.toml`, `DATABASE_PATH` desteği.

---

## Adım 1 — Kodu GitHub’a koyun

### En kolay yol: GitHub Desktop

1. [GitHub Desktop](https://desktop.github.com) indirip kurun.
2. GitHub’da **yeni repository** oluşturun (ör. `budgetmind`).
3. GitHub Desktop’ta **File → Add local repository** → proje klasörünü seçin (`harcama_takip_analiz`).
4. İlk kez ise **create repository** / commit mesajı yazıp **Publish repository** deyin.
5. GitHub web sayfasında dosyalarınızın göründüğünü kontrol edin.

*(Komut satırı biliyorsanız: `git remote add` + `git push` da olur.)*

---

## Adım 2 — Railway’e giriş

1. [https://railway.app](https://railway.app) → **Login** → **GitHub ile devam**.
2. Onay verin.

---

## Adım 3 — Projeyi Railway’de oluşturun

1. **New Project** → **Deploy from GitHub repo**.
2. Listeden `budgetmind` (veya adını verdiğiniz) repoyu seçin.
3. Railway otomatik **Build** ve **Deploy** dener. Bir süre bekleyin.

---

## Adım 4 — Kalıcı disk (Volume) — kayıtların silinmemesi için şart

SQLite dosyası diske yazılır; bulutta “volume” yoksa uygulama yeniden başlayınca veri kaybolabilir.

1. Railway’de projenize girin → servisinize (web) tıklayın.
2. **Volumes** (veya **New Volume**) bölümünü bulun.
3. **Mount path** olarak şunu yazın: **`/data`**
4. Kaydedin / volume’u servise bağlayın.

---

## Adım 5 — Ortam değişkenleri (Variables)

Servis → **Variables** sekmesi → **New Variable**:

| Ad | Örnek değer | Açıklama |
|----|----------------|----------|
| `DATABASE_PATH` | `/data/budgetmind.db` | Volume ile aynı yol |
| `ADMIN_PASSWORD` | Güçlü bir şifre | İlk admin girişi (`admin` kullanıcısı) |
| `JWT_SECRET` | En az 32 karakter rastgele | [random.org](https://www.random.org/strings) veya uzun şifre |
| `NODE_ENV` | `production` | İsteğe bağlı; üretim modu |

**Not:** Railway genelde `PORT` verir; eklemeniz gerekmez.

Değişiklikten sonra servis **yeniden deploy** olur.

---

## Adım 6 — Site adresinizi alın

1. Servis → **Settings** → **Networking** / **Generate Domain**.
2. Çıkan adresi (ör. `xxx.up.railway.app`) tarayıcıda açın.
3. Ana sayfa: `/` — Yönetim: `/admin.html`

Varsayılan yönetim kullanıcı adı: **`admin`** — şifre: Variables’ta verdiğiniz `ADMIN_PASSWORD`.

---

## Adım 7 — Kontrol listesi

- [ ] Ana sayfada anket açılıyor.
- [ ] “FSI hesapla” sonuç veriyor.
- [ ] `/admin.html` ile giriş yapılabiliyor.
- [ ] Volume tanımlı ve `DATABASE_PATH=/data/budgetmind.db`.

---

## E-posta gönderimi (isteğe bağlı)

Gmail uygulama şifresi vb. için `.env.example` içindeki `SMTP_*` alanlarını Railway **Variables** olarak ekleyin (`SMTP_USER`, `SMTP_PASS`, …).

---

## Sorun çıkarsa

- **Build hata veriyor:** Railway loglarına bakın; `better-sqlite3` için Linux’ta derleme gerekir — `Dockerfile` bunun içindir. Serviste **Dockerfile kullanımı** seçeneği varsa açın veya Root Directory / Dockerfile path’i kontrol edin.
- **Giriş / çerez:** Siteyi her zaman Railway verdiği **HTTPS** adresiyle kullanın.
- **Yerelde Docker denemek:** Proje kökünde `docker compose up --build` — sonra `http://localhost:3000`.

---

## Özet

1. GitHub’a kod yükle  
2. Railway → GitHub repoyu bağla  
3. **Volume:** `/data`  
4. **Variables:** `DATABASE_PATH`, `JWT_SECRET`, `ADMIN_PASSWORD`  
5. Domain aç → internetten kullan

Bu adımlarla uygulama **tek parça** çalışır: anket, kayıt, yönetim ve analizler aynı sunucuda.
