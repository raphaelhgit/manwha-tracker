import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listManhwa,
  getManhwa,
  createManhwa,
  updateManhwa,
  deleteManhwa,
  COVERS_DIR,
} from './db.js';
import { searchManga } from './search.js';
import {
  checkLoginRateLimit,
  clearSessionCookie,
  getSession,
  recordLoginAttempt,
  requireAdmin,
  setSessionCookie,
  verifyPassword,
} from './auth.js';
import { aliasesFromTitles, parseAliases } from './fuzzy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '../frontend/dist');
const isProd = process.env.NODE_ENV === 'production';

const app = express();

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

if (!isProd) {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  res.json({ admin: Boolean(session) });
});

app.post('/api/auth/login', (req, res) => {
  const limit = checkLoginRateLimit(req);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie plus tard.' });
  }

  const password = String(req.body?.password || '');
  if (!verifyPassword(password)) {
    recordLoginAttempt(req, false);
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  recordLoginAttempt(req, true);
  setSessionCookie(res, req);
  res.json({ ok: true, admin: true });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const results = await searchManga(q);
    res.json(results);
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: 'Recherche impossible' });
  }
});

app.get('/api/manhwa', (_req, res) => {
  res.json(listManhwa());
});

app.get('/api/manhwa/:id', (req, res) => {
  const row = getManhwa(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Introuvable' });
  res.json(row);
});

app.post('/api/manhwa', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Titre requis' });

    let cover_path = null;
    if (body.coverData) {
      cover_path = saveCoverFromDataUrl(body.coverData);
    } else if (body.coverUrl) {
      cover_path = await downloadCover(body.coverUrl, body.source, body.externalId);
    }

    const row = createManhwa({
      title,
      cover_path,
      last_chapter: body.last_chapter ?? '',
      comment: body.comment ?? '',
      score: body.score ?? 0,
      status: body.status ?? 'en_cours',
      type: body.type ?? 'manhwa',
      summary: body.summary ?? '',
      source: body.source ?? null,
      external_id: body.externalId ?? body.external_id ?? null,
      aliases: aliasesFromTitles(title, parseAliases(body.aliases ?? body.titles ?? [])),
    });

    res.status(201).json(row);
  } catch (err) {
    console.error('[create]', err);
    res.status(500).json({ error: err.message || 'Création impossible' });
  }
});

app.put('/api/manhwa/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!getManhwa(id)) return res.status(404).json({ error: 'Introuvable' });

    const body = req.body || {};
    const patch = {};

    if (body.title !== undefined) patch.title = String(body.title).trim();
    if (body.last_chapter !== undefined) patch.last_chapter = String(body.last_chapter);
    if (body.comment !== undefined) patch.comment = String(body.comment);
    if (body.score !== undefined) patch.score = body.score;
    if (body.status !== undefined) patch.status = body.status;
    if (body.type !== undefined) patch.type = body.type;
    if (body.summary !== undefined) patch.summary = String(body.summary);
    if (body.aliases !== undefined) {
      const titleForAlias =
        body.title !== undefined ? String(body.title).trim() : getManhwa(id)?.title || '';
      patch.aliases = aliasesFromTitles(titleForAlias, parseAliases(body.aliases));
    }

    if (body.coverData) {
      const current = getManhwa(id);
      const newPath = saveCoverFromDataUrl(body.coverData);
      if (current?.cover_path) {
        try {
          fs.unlinkSync(path.join(COVERS_DIR, current.cover_path));
        } catch {
          /* ignore */
        }
      }
      patch.cover_path = newPath;
    } else if (body.coverUrl) {
      const current = getManhwa(id);
      const newPath = await downloadCover(body.coverUrl, body.source, body.externalId || id);
      if (current?.cover_path) {
        try {
          fs.unlinkSync(path.join(COVERS_DIR, current.cover_path));
        } catch {
          /* ignore */
        }
      }
      patch.cover_path = newPath;
    } else if (body.removeCover === true) {
      const current = getManhwa(id);
      if (current?.cover_path) {
        try {
          fs.unlinkSync(path.join(COVERS_DIR, current.cover_path));
        } catch {
          /* ignore */
        }
      }
      patch.cover_path = null;
    }

    const row = updateManhwa(id, patch);
    res.json(row);
  } catch (err) {
    console.error('[update]', err);
    res.status(500).json({ error: err.message || 'Mise à jour impossible' });
  }
});

app.delete('/api/manhwa/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = deleteManhwa(id);
  if (!row) return res.status(404).json({ error: 'Introuvable' });

  if (row.cover_path) {
    try {
      fs.unlinkSync(path.join(COVERS_DIR, row.cover_path));
    } catch {
      /* ignore */
    }
  }
  res.json({ ok: true });
});

app.use('/covers', express.static(COVERS_DIR, { maxAge: '7d' }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/covers')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`manwha-tracker listening on :${PORT}`);
});

async function downloadCover(url, source, externalId) {
  const headers = {
    Accept: 'image/*,*/*',
    'User-Agent': 'manwha-tracker/1.0',
  };
  if (source === 'webtoon' || url.includes('pstatic.net')) {
    headers.Referer = 'https://www.webtoons.com/';
  }
  if (source === 'novelfire' || url.includes('novelfire.net')) {
    headers.Referer = 'https://novelfire.net/';
  }

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Téléchargement cover HTTP ${res.status}`);

  const ctype = res.headers.get('content-type') || '';
  let ext = '.jpg';
  if (ctype.includes('png')) ext = '.png';
  else if (ctype.includes('webp')) ext = '.webp';
  else if (ctype.includes('gif')) ext = '.gif';
  else {
    const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromUrl)) ext = fromUrl;
  }

  const safe = String(externalId || Date.now())
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  const filename = `${source || 'ext'}-${safe}-${Date.now()}${ext}`;
  const dest = path.join(COVERS_DIR, filename);

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return filename;
}

function saveCoverFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const m = raw.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) throw new Error('Image invalide (attendu PNG/JPEG/WebP/GIF en base64)');

  let ext = '.jpg';
  const mime = m[1].toLowerCase();
  if (mime.includes('png')) ext = '.png';
  else if (mime.includes('webp')) ext = '.webp';
  else if (mime.includes('gif')) ext = '.gif';

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('Image trop lourde (max 5 Mo)');

  const filename = `upload-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(COVERS_DIR, filename), buf);
  return filename;
}
