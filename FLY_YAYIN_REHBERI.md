# BudgetMind — Fly.io ile yayın (Railway kredisi bittiyse)

Railway ücret istiyorsa **Fly.io** benzer işi yapar: Docker ile uygulama + **kalıcı disk** (SQLite için `/data`).

> Fly.io bazen **doğrulama için kredi kartı** isteyebilir; ücret alınmayabilir — [fly.io/docs](https://fly.io/docs/about/pricing/) güncel koşulları okuyun. Kart vermek istemezseniz en altta **Render (ücretsiz, uyarılı)** ve **yerel + tünel** seçenekleri var.

---

## 0) Önkoşul

- Kod GitHub’da: [github.com/beyzkonukerr/budgetmind](https://github.com/beyzkonukerr/budgetmind)
- Bilgisayarınızda **PowerShell** veya Terminal

---

## 1) Fly CLI kurulumu (Windows)

PowerShell **Yönetici olarak** açıp (bir kez):

```powershell
winget install --id=fly.io.superfly
```

Kurulumdan sonra **yeni bir terminal** açın. Kontrol:

```powershell
fly version
```

---

## 2) Fly hesabı

```powershell
fly auth signup
```

veya

```powershell
fly auth login
```

Tarayıcı açılır; girişi tamamlayın.

---

## 3) Proje klasörüne gidin

```powershell
cd C:\Users\User\Downloads\harcama_takip_analiz
```

---

## 4) Uygulama adı (benzersiz)

`fly.toml` içinde `app = "budgetmind-app"` yazıyor. Fly “bu isim alınmış” derse dosyada değiştirin, örn. `budgetmind-beyza-2026`.

Fly’da bu isimde uygulama **yoksa** önce oluşturun (organizasyon adı sorulursa `personal` seçebilirsiniz):

```powershell
fly apps create budgetmind-app
```

Hata alırsanız: `fly orgs list` ile org adını görüp `--org ORG_ADI` ekleyin.

---

## 5) Kalıcı disk (volume)

**Önce** volume oluşturun; bölge `fly.toml` içindeki `primary_region` ile aynı olsun (örnek: `fra` — Frankfurt):

```powershell
fly volumes create budgetmind_data --region fra --size 1
```

`budgetmind_data` adı `fly.toml` içindeki `[mounts] source` ile **aynı** olmalı.

---

## 6) Gizli ayarlar (şifreler)

Güçlü değerler kullanın:

```powershell
fly secrets set DATABASE_PATH=/data/budgetmind.db ADMIN_PASSWORD="EN_AZ_10_KARAKTER_GÜÇLÜ" JWT_SECRET="EN_AZ_32_KARAKTER_RASTGELE_ANAHATAR"
```

Sunucu `NODE_ENV=production` ile çalışır: **`JWT_SECRET` en az 32**, **`ADMIN_PASSWORD` en az 10** karakter olmalı; **`admin123` yasaktır** (aksi halde süreç başlamaz). Ayrıntı: [GUVENLI_YAYIN.md](./GUVENLI_YAYIN.md).

---

## 7) İlk deploy

```powershell
fly deploy
```

Bitince Fly size bir **URL** verir (ör. `https://budgetmind-app.fly.dev`).

- Ana sayfa: `https://.../`
- Yönetim: `https://.../admin.html`  
  Kullanıcı: **`admin`**, şifre: `ADMIN_PASSWORD` ile verdiğiniz.

---

## 8) Sorun çıkarsa

| Durum | Ne yapın |
|--------|-----------|
| `volume ... already exists` | Aynı isim/bölge kullanılıyor; Fly panelden veya `fly volumes list` ile kontrol edin. |
| Build uzun sürer | İlk seferde Docker + `npm ci` normal; 5–10 dk sürebilir. |
| Health check kırmızı | Log: `fly logs` — `/api/health` dönüyor mu bakın. |
| `app` adı çakışıyor | `fly.toml` içinde `app` değiştirin, tekrar `fly deploy`. |

---

## Ücretsiz alternatif: Render (kart istemeyebilir — dikkat)

- [render.com](https://render.com) → **Web Service** → GitHub repoyu bağlayın.  
- **Start:** `node server.js`  
- **Ücretsiz** planda makine **uykuya** geçer; bazen dosya sistemi **kalıcı değildir** → **SQLite kayıtları kaybolabilir**. Tam üretim için Fly + volume veya ücretli disk daha doğru.

---

## Sıfır maliyet: kendi bilgisayarınız + Cloudflare Tunnel

- Evde `npm start` ile sunucuyu çalıştırın.  
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) ile dışarıya HTTPS adresi verilebilir.  
- Bilgisayar kapalıyken site de kapalı olur; öğrenci demosu için yeterli olabilir.

---

## Özet

1. `winget install fly.io.superfly`  
2. `fly auth login`  
3. `fly volumes create budgetmind_data --region fra --size 1`  
4. `fly secrets set DATABASE_PATH=... ADMIN_PASSWORD=... JWT_SECRET=...`  
5. `fly deploy`  

Takılırsanız **`fly logs`** çıktısının son kısmını (şifre yazmadan) paylaşın.
