# BudgetMind — İnternete tam uygulama yayını (her şey bir arada)

Bu rehber, **anket + API + yönetim paneli + SQLite kayıtlar**ın hepsinin internette çalışması içindir.

> **Önemli:** [Vercel](https://vercel.com) bu proje için **tam sürüm değildir**. Tam sürüm için **Railway** veya **Fly.io** kullanın.

> **Railway krediniz bitti / upgrade istemiyorsanız:** bu repoda **[FLY_YAYIN_REHBERI.md](./FLY_YAYIN_REHBERI.md)** ile Fly.io + kalıcı disk adımları var (`fly.toml` + `Dockerfile` hazır).

---

## GitHub hazır mı?

Bu repoyu kullanın (kod burada olmalı): **[github.com/beyzkonukerr/budgetmind](https://github.com/beyzkonukerr/budgetmind)**

Tarayıcıda açıp dosyaların (`server.js`, `package.json` vb.) göründüğünü doğrulayın. Tamamsa aşağıdaki adımlara geçin — **sırayı mümkün olduğunca bu şekilde uygulayın.**

---

## Sizden gerekenler (özet)

| Ne | Neden |
|----|--------|
| **[Railway](https://railway.app)** hesabı (GitHub ile giriş) | Sunucu |
| İsteğe bağlı: **kredi kartı** | Railway deneme sonrası ücretlendirme için (site politikalarına bakın) |

Kod tarafında hazır: `Dockerfile`, `railway.toml`, `nixpacks.toml`, `DATABASE_PATH` desteği.

---

## Railway — adım adım (panoda tıklayarak)

### 1) Giriş

1. [railway.app](https://railway.app) → **Login** → **GitHub** ile devam.

### 2) Yeni proje + repo

1. **New Project**
2. **Deploy from GitHub repo** (veya benzer ifade)
3. Listeden **`beyzkonukerr/budgetmind`** repoyu seçin ve onaylayın.
4. İlk **build/deploy** bitene kadar bekleyin (Loglar sekmesinden izleyebilirsiniz).

### 3) Kalıcı disk (Volume) — önce bunu bağlayın

Kayıtların silinmemesi için:

1. Oluşan **servise** (web / app) tıklayın.
2. **Volumes** (veya **New Volume**) → yeni volume ekleyin.
3. **Mount path** tam olarak: **`/data`**
4. Volume’u bu servise **bağlayıp** kaydedin.

### 4) Ortam değişkenleri (Variables)

Aynı serviste **Variables** → **New Variable** ile ekleyin:

| Ad | Değer | Not |
|----|--------|-----|
| `DATABASE_PATH` | `/data/budgetmind.db` | Volume ile aynı kök (`/data`) |
| `ADMIN_PASSWORD` | Kendi güçlü şifreniz | Giriş: kullanıcı **`admin`**, şifre bu |
| `JWT_SECRET` | En az 32 karakter, rastgele | Örn. şifre yöneticisinden veya [random.org/strings](https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new) |
| `NODE_ENV` | `production` | İsteğe bağlı |

**Not:** `PORT` genelde Railway tarafından verilir; eklemeyin (çakışma olmasın).

Kaydettiğinizde servis genelde **yeniden deploy** olur.

### 5) İnternet adresi (domain)

1. Servis → **Settings** → **Networking** (veya **Public Networking**).
2. **Generate Domain** (veya **Custom Domain**) ile bir adres üretin.
3. Çıkan URL’yi tarayıcıda açın:
   - Ana uygulama: `https://SIZIN-ADRES/`
   - Yönetim: `https://SIZIN-ADRES/admin.html`

### 6) İlk giriş (yönetim)

- Kullanıcı adı: **`admin`**
- Şifre: Variables’ta yazdığınız **`ADMIN_PASSWORD`**

---

## Kontrol listesi

- [ ] GitHub’da `budgetmind` reposu dolu.
- [ ] Railway’de servis **Running** / deploy başarılı.
- [ ] Volume mount: **`/data`**
- [ ] `DATABASE_PATH=/data/budgetmind.db`
- [ ] `JWT_SECRET` ve `ADMIN_PASSWORD` tanımlı.
- [ ] Ana sayfada anket ve “FSI hesapla” çalışıyor.
- [ ] `/admin.html` ile giriş yapılabiliyor.

---

## Derleme (build) hata verirse

1. Servis → **Deployments** → son deploy → **Logs**.
2. `better-sqlite3` veya derleyici hatası görürseniz Railway’de **Dockerfile ile build** kullanmayı deneyin:
   - Servis ayarlarında builder / Dockerfile seçeneği varsa **Dockerfile** yolunu proje kökü olarak bırakın (repoda `Dockerfile` var).
3. Yine olmazsa logdaki **tam hata metnini** kopyalayıp destek alın.

---

## E-posta (isteğe bağlı)

`.env.example` içindeki `SMTP_*` alanlarını Railway **Variables** olarak ekleyin.

---

## Bana iletebileceğiniz bilgiler (takılırsanız)

Aşağıdakilerden **birini** yazmanız yeterli; devamını birlikte netleştiririz:

- Railway **Deploy log** son 30–40 satır (kopyala-yapıştır), veya  
- “Build failed” ekranının ekran görüntüsü açıklaması, veya  
- Üretilen site adresi + “şu sayfa açılmıyor / şu buton çalışmıyor” cümlesi.

**Güvenlik:** `ADMIN_PASSWORD`, `JWT_SECRET` veya e-posta şifrelerini **paylaşmayın**.

---

## Özet (Railway)

1. **New Project** → GitHub → **`beyzkonukerr/budgetmind`**
2. **Volume** → mount **`/data`**
3. **Variables** → `DATABASE_PATH`, `ADMIN_PASSWORD`, `JWT_SECRET`, isteğe bağlı `NODE_ENV=production`
4. **Generate Domain** → siteyi ve `/admin.html` adresini test edin

Bu adımlarla uygulama **tek parça** çalışır: anket, kayıt, yönetim ve analizler aynı sunucuda.
