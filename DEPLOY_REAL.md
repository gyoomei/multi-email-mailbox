# Deploy Real Backend

GitHub Pages hanya bisa menjalankan frontend static. Supaya login/register, IMAP inbox, dan SMTP send benar-benar real, backend Node.js harus online di URL HTTPS sendiri.

## Arsitektur real

```text
GitHub Pages frontend
https://gyoomei.github.io/multi-email-mailbox/
        |
        | fetch(VITE_API_URL)
        v
Backend Node.js HTTPS
https://mailhub-api.domain.com
        |
        +-- simpan user/account credential terenkripsi
        +-- konek IMAP ke server email
        +-- konek SMTP untuk kirim email
```

## Env backend wajib

```env
PORT=8787
JWT_SECRET=isi-random-panjang
MAILBOX_SECRET=isi-random-panjang-minimal-32-karakter
```

`MAILBOX_SECRET` jangan diganti setelah ada akun email tersimpan, karena dipakai untuk decrypt password email.

## Opsi hosting backend

### Opsi A — VPS sendiri paling aman/stabil

```bash
cd /root/multi-email-mailbox
cp .env.example .env
npm install
npm run server
```

Lalu pasang reverse proxy HTTPS, contoh Nginx/Caddy, dari domain seperti:

```text
https://mailhub-api.domain.com -> http://localhost:8787
```

### Opsi B — Render/Fly/Railway

Deploy sebagai Web Service Node.js/Docker dengan command:

```bash
npm run server
```

Set environment variable:

```env
JWT_SECRET=...
MAILBOX_SECRET=...
PORT=8787
```

Penting: current MVP menyimpan data ke `server/data.json`. Untuk production beneran, pakai persistent disk atau upgrade ke database PostgreSQL supaya user/account tidak hilang saat redeploy/restart.

## Hubungkan frontend GitHub Pages ke backend

Set GitHub Actions secret di repo:

```text
VITE_API_URL=https://URL-BACKEND-KAMU
```

Lalu workflow build frontend harus membawa env tersebut saat `npm run build`.

Contoh:

```yaml
- name: Build
  env:
    VITE_API_URL: ${{ secrets.VITE_API_URL }}
  run: npm run build
```

Setelah push/redeploy, GitHub Pages tidak lagi memakai mode demo. Semua request login/register akan masuk ke backend real.

## Verifikasi

```bash
curl https://URL-BACKEND-KAMU/api/health
```

Harus keluar:

```json
{"ok":true,"service":"mailhub"}
```
