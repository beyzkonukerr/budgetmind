# Güvenli tam yayın (veritabanı + hesaplar + panel)

Bu uygulama **tek bir Node sunucusunda** çalışınca tam özelliktir: SQLite, analiz, yönetim, oturum.  
**Vercel** tam sürüm için uygun değildir (kalıcı SQLite + uzun süreli süreç yok).

## Güvenlik özeti (kod + sizin ayarlarınız)

| Konu | Ne yapılıyor |
|------|----------------|
| **Ağ** | Yayında HTTPS (Fly / Railway / benzeri sağlayıcı TLS verir). Üretimde **HSTS** başlığı açılır. |
| **Oturum** | Admin JWT, **HttpOnly** çerezde; üretimde **`Secure`** (yalnızca HTTPS). |
| **Üretim sırları** | `NODE_ENV=production` iken zayıf varsayılanlar **sunucu başlamaz**: `JWT_SECRET` ≥ 32 karakter, `ADMIN_PASSWORD` ortamdan, `admin123` yasak, en az 10 karakter. |
| **Eski API şifresi** | `X-Admin-Password` ile tam yetki **üretimde kapalıdır**. Gerekirse (önerilmez) `ALLOW_LEGACY_ADMIN_HEADER=true`. Geliştirmede varsayılan açık. |
| **İstek gövdesi** | JSON limiti Express varsayılanı; admin şifreleri sunucuda **scrypt** ile hash. |
| **CORS** | İsteğe bağlı sıkılaştırma: `CORS_ORIGIN=https://siteniz.com` (virgülle birden fazla). Boşsa mevcut davranış (geniş) korunur. |

## Önerilen barındırma (tam özellik + kalıcı disk)

1. **Fly.io** — [FLY_YAYIN_REHBERI.md](./FLY_YAYIN_REHBERI.md) (`fly.toml` + volume `/data` + `DATABASE_PATH`).  
2. **Railway** — [YAYIN_REHBERI.md](./YAYIN_REHBERI.md) (volume + değişkenler).

İkisinde de:

- **`DATABASE_PATH=/data/budgetmind.db`** (veya volume ile uyumlu yol)  
- **`JWT_SECRET`**: en az **32** karakter, rastgele  
- **`ADMIN_PASSWORD`**: en az **10** karakter, `admin123` **olamaz**  
- **`NODE_ENV=production`** (Docker / sağlayıcı genelde verir)

## Yedek

Veritabanı dosyasını düzenli kopyalayın:

```bash
npm run backup:db
```

Bulutta volume üzerindeki `.db` dosyasını sağlayıcının önerdiği yedekleme ile de koruyun.

## Ne “en güvenli” yapmaz?

- `.env` veya sırları GitHub’a koymayın.  
- Üretimde `ALLOW_LEGACY_ADMIN_HEADER=true` kullanmayın (sadece zorunlu hata ayıklama).  
- Ücretsiz “uyuyan” servislerde disk kalıcı olmayabilir; hem **güvenlik** hem **veri** için kalıcı volume / ücretli disk politikalarını okuyun.

## Yerel geliştirme

`NODE_ENV=production` olmadan çalıştığınızda eski davranış korunur (daha gevşek sırlar, `X-Admin-Password` açık). Üretim ayarını **yalnızca canlı ortamda** kullanın.
