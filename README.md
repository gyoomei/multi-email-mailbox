# MailHub Multi Email

Website MVP untuk login user, menyimpan banyak akun email, membaca Inbox via IMAP, dan mengirim email via SMTP.

## Fitur

- Login/register user website.
- Tambah banyak akun email IMAP/SMTP.
- Credential email dienkripsi AES-256-GCM di `server/data.json`.
- Inbox terpadu: pilih akun, refresh pesan masuk, baca detail email.
- Kirim email dari akun yang dipilih.
- UI React bersih dan responsif.

## Menjalankan lokal

```bash
cp .env.example .env
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Catatan Gmail/Outlook

- Gmail sebaiknya memakai App Password atau OAuth di versi lanjutan. Password biasa sering ditolak Google.
- Outlook personal/Office365 sering butuh OAuth; SMTP basic auth bisa dinonaktifkan oleh tenant.
- Email custom/domain biasanya cukup IMAP + SMTP.

## Deploy

Frontend bisa dideploy ke Vercel, tapi backend IMAP/SMTP lebih stabil di VPS/Render/Fly/Railway karena membutuhkan koneksi TCP ke server email. Set env `VITE_API_URL` mengarah ke backend.
