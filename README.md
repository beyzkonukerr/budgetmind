# BudgetMind (harcama_takip_analiz)

Finansal stres indeksi (FSI) anketi, Express API, SQLite kayıtlar ve yönetim paneli — **tek sunucuda tam uygulama**.

## İnternete tam sürüm (önerilen)

- **Railway:** **[YAYIN_REHBERI.md](./YAYIN_REHBERI.md)**  
- **Railway kredisi bitti / ücret istemiyorsanız:** **[FLY_YAYIN_REHBERI.md](./FLY_YAYIN_REHBERI.md)** (Fly.io + `fly.toml` + kalıcı volume)

## Yerel çalıştırma

```bash
npm install
npm start
```

Tarayıcı: `http://localhost:3000` — yönetim: `http://localhost:3000/admin.html`

İsteğe bağlı `.env`: `.env.example` dosyasına bakın. Bulutta kalıcı veri için `DATABASE_PATH` (ör. `/data/budgetmind.db`) kullanılır.

**Cursor / VS Code:** Run and Debug → *Sunucu: BudgetMind (F5)*

### `better-sqlite3` / Node uyumsuzluğu

```bash
npm run rebuild:sqlite
```

Node **18–22** (bkz. `.nvmrc`: 20).

## Docker (yerel veya sunucuda)

```bash
docker compose up --build
```

`ADMIN_PASSWORD` ve `JWT_SECRET` için ortam değişkeni verin veya `docker-compose.yml` içindeki varsayılanları üretimde değiştirin.

## Vercel (sadece önizleme)

Statik sayfa + `api/analyze` sunucusuz uçlar; **kayıt ve tam yönetim paneli çalışmaz**. Tam özellik için Railway vb. kullanın.

## Komutlar

| Komut | Açıklama |
|--------|----------|
| `npm start` | Express sunucusu |
| `npm test` | API duman testi |
| `npm run backup:db` | Veritabanı yedeği (`DATABASE_PATH` destekler) |
| `npm run rebuild:sqlite` | Native modülü yeniden derleme |
