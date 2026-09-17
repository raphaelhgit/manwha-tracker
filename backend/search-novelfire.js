const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE = 'https://novelfire.net';

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+\n/g, '\n')
    .trim();
}

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

function parseSearchItems(html) {
  const items = [];
  const re = /<li class="novel-item">([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const title = block.match(/<a[^>]+title="([^"]+)"/i)?.[1];
    const href = block.match(/<a[^>]+href="([^"]+)"/i)?.[1];
    const img = block.match(/<img[^>]+src="([^"]+)"/i)?.[1];
    if (!title || !href) continue;
    const slug = href.replace(/^\/book\//, '').replace(/\/$/, '');
    items.push({
      title,
      href: absUrl(href),
      cover: absUrl(img),
      slug,
    });
    if (items.length >= 8) break;
  }
  return items;
}

async function fetchNovelMeta(bookUrl) {
  try {
    const res = await fetch(bookUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { cover: null, summary: null };
    const html = await res.text();
    const cover =
      html.match(/property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/content="([^"]+)"[^>]+property="og:image"/i)?.[1] ||
      null;
    const raw =
      html.match(/itemprop="description"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/content="([^"]+)"[^>]+itemprop="description"/i)?.[1] ||
      null;
    const summary = raw ? stripHtml(raw).slice(0, 2000) : null;
    return { cover: cover ? absUrl(cover) : null, summary };
  } catch {
    return { cover: null, summary: null };
  }
}

export async function searchNovelFire(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const url = `${BASE}/search?keyword=${encodeURIComponent(q)}&type=title`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`NovelFire HTTP ${res.status}`);

  const html = await res.text();
  const items = parseSearchItems(html);
  const out = [];

  for (const item of items.slice(0, 6)) {
    const meta = await fetchNovelMeta(item.href);
    out.push({
      title: item.title,
      titles: [item.title],
      cover: meta.cover || item.cover,
      summary: meta.summary,
      source: 'novelfire',
      externalId: item.slug,
      country: null,
      format: 'NOVEL',
      suggestedType: 'light_novel',
    });
  }

  return out;
}
