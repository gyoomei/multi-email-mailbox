import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

const app = express()
const PORT = Number(process.env.PORT || 8787)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me'
const MAILBOX_SECRET = process.env.MAILBOX_SECRET || 'dev-only-mailbox-secret-change-me-please'
const DATA_PATH = path.join(process.cwd(), 'server', 'data.json')

app.use(cors())
app.use(express.json({ limit: '3mb' }))

async function readDb() {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') return { users: [], accounts: [] }
    throw error
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true })
  await fs.writeFile(DATA_PATH, JSON.stringify(db, null, 2))
}

function key() {
  return crypto.createHash('sha256').update(MAILBOX_SECRET).digest()
}

function encrypt(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

function decrypt(value) {
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })
}

function publicAccount(account) {
  const { passwordEnc, ...safe } = account
  return safe
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Token tidak ada' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token tidak valid/expired' })
  }
}

function accountToImapConfig(account) {
  return {
    host: account.imapHost,
    port: Number(account.imapPort),
    secure: Boolean(account.imapSecure),
    auth: { user: account.username, pass: decrypt(account.passwordEnc) },
    logger: false
  }
}

function accountToSmtpConfig(account) {
  return {
    host: account.smtpHost,
    port: Number(account.smtpPort),
    secure: Boolean(account.smtpSecure),
    auth: { user: account.username, pass: decrypt(account.passwordEnc) }
  }
}

async function getOwnedAccount(userId, accountId) {
  const db = await readDb()
  const account = db.accounts.find((item) => item.id === accountId && item.userId === userId)
  if (!account) throw Object.assign(new Error('Akun email tidak ditemukan'), { status: 404 })
  return account
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'mailhub' }))

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email dan password minimal 6 karakter wajib diisi' })
  }
  const db = await readDb()
  const normalized = String(email).trim().toLowerCase()
  if (db.users.some((user) => user.email === normalized)) {
    return res.status(409).json({ error: 'User sudah terdaftar' })
  }
  const user = { id: nanoid(), email: normalized, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() }
  db.users.push(user)
  await writeDb(db)
  res.json({ token: sign(user), user: { id: user.id, email: user.email } })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const db = await readDb()
  const user = db.users.find((item) => item.email === String(email || '').trim().toLowerCase())
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Email atau password salah' })
  }
  res.json({ token: sign(user), user: { id: user.id, email: user.email } })
})

app.get('/api/accounts', auth, async (req, res) => {
  const db = await readDb()
  res.json({ accounts: db.accounts.filter((account) => account.userId === req.user.sub).map(publicAccount) })
})

app.post('/api/accounts', auth, async (req, res) => {
  const body = req.body || {}
  const required = ['name', 'emailAddress', 'username', 'password', 'imapHost', 'imapPort', 'smtpHost', 'smtpPort']
  const missing = required.filter((field) => !body[field])
  if (missing.length) return res.status(400).json({ error: `Field wajib: ${missing.join(', ')}` })
  const db = await readDb()
  const account = {
    id: nanoid(),
    userId: req.user.sub,
    name: String(body.name),
    emailAddress: String(body.emailAddress).trim(),
    username: String(body.username).trim(),
    passwordEnc: encrypt(body.password),
    imapHost: String(body.imapHost).trim(),
    imapPort: Number(body.imapPort),
    imapSecure: body.imapSecure !== false,
    smtpHost: String(body.smtpHost).trim(),
    smtpPort: Number(body.smtpPort),
    smtpSecure: Boolean(body.smtpSecure),
    createdAt: new Date().toISOString()
  }
  db.accounts.push(account)
  await writeDb(db)
  res.json({ account: publicAccount(account) })
})

app.delete('/api/accounts/:id', auth, async (req, res) => {
  const db = await readDb()
  const before = db.accounts.length
  db.accounts = db.accounts.filter((account) => !(account.id === req.params.id && account.userId === req.user.sub))
  await writeDb(db)
  res.json({ deleted: before !== db.accounts.length })
})

app.get('/api/accounts/:id/messages', auth, async (req, res) => {
  let client
  try {
    const account = await getOwnedAccount(req.user.sub, req.params.id)
    const limit = Math.min(Number(req.query.limit || 30), 100)
    client = new ImapFlow(accountToImapConfig(account))
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const messages = []
    try {
      for await (const message of client.fetch(`${Math.max(1, client.mailbox.exists - limit + 1)}:*`, { envelope: true, flags: true, internalDate: true, source: false, uid: true })) {
        messages.push({
          uid: message.uid,
          subject: message.envelope?.subject || '(Tanpa subject)',
          from: message.envelope?.from?.map((item) => item.address || item.name).filter(Boolean).join(', ') || 'Unknown',
          date: message.internalDate,
          seen: Array.from(message.flags || []).includes('\\Seen')
        })
      }
    } finally {
      lock.release()
    }
    await client.logout()
    messages.sort((a, b) => Number(b.uid) - Number(a.uid))
    res.json({ messages })
  } catch (error) {
    try { await client?.logout() } catch {}
    res.status(error.status || 502).json({ error: error.message || 'Gagal mengambil inbox' })
  }
})

app.get('/api/accounts/:id/messages/:uid', auth, async (req, res) => {
  let client
  try {
    const account = await getOwnedAccount(req.user.sub, req.params.id)
    client = new ImapFlow(accountToImapConfig(account))
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const message = await client.fetchOne(Number(req.params.uid), { source: true, envelope: true, internalDate: true }, { uid: true })
      if (!message) return res.status(404).json({ error: 'Email tidak ditemukan' })
      const parsed = await simpleParser(message.source)
      res.json({
        uid: Number(req.params.uid),
        subject: parsed.subject || '(Tanpa subject)',
        from: parsed.from?.text || '',
        to: parsed.to?.text || '',
        date: parsed.date || message.internalDate,
        text: parsed.text || '',
        html: parsed.html || '',
        attachments: parsed.attachments?.map((item) => ({ filename: item.filename, contentType: item.contentType, size: item.size })) || []
      })
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (error) {
    try { await client?.logout() } catch {}
    res.status(error.status || 502).json({ error: error.message || 'Gagal membaca email' })
  }
})

app.post('/api/accounts/:id/send', auth, async (req, res) => {
  try {
    const account = await getOwnedAccount(req.user.sub, req.params.id)
    const { to, cc, bcc, subject, text, html } = req.body || {}
    if (!to || !subject || (!text && !html)) return res.status(400).json({ error: 'To, subject, dan isi pesan wajib diisi' })
    const transporter = nodemailer.createTransport(accountToSmtpConfig(account))
    const info = await transporter.sendMail({
      from: `${account.name} <${account.emailAddress}>`,
      to,
      cc,
      bcc,
      subject,
      text,
      html: html || undefined
    })
    res.json({ ok: true, messageId: info.messageId })
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || 'Gagal mengirim email' })
  }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Server error' })
})

app.listen(PORT, () => console.log(`MailHub API running on http://localhost:${PORT}`))
