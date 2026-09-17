const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const LANGS = ['fr', 'en'];

function slugify(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function searchWebtoon(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const byNo = new Map();

  for (const lang of LANGS) {
    try {
      const url = `https://www.webtoons.com/${lang}/search/immediate?keyword=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const list = json?.result?.searchedList ?? [];
      for (const item of list) {
        if (item.searchMode !== 'TITLE' || !item.titleNo) continue;
        const existing = byNo.get(item.titleNo);
        if (!existing || lang === 'fr') {
          byNo.set(item.titleNo, { ...item, lang });
        }
      }
    } catch (e) {
      console.warn('[webtoon] search', lang, e.message);
    }
  }

  const out = [];
  for (const item of byNo.values()) {
    const meta = await fetchWebtoonMeta(item);
    out.push({
      title: item.title,
      titles: [item.title],
      cover: meta.cover,
      summary: meta.summary,
      source: 'webtoon',
      externalId: String(item.titleNo),
      country: 'KR',
      format: 'WEBTOON',
      suggestedType: 'manhwa',
      webtoonLang: item.lang,
      webtoonGenre: item.representGenre,
    });
    if (out.length >= 8) break;
  }
  return out;
}

async function fetchWebtoonMeta(item) {
  const langs = [item.lang, 'en', 'fr'].filter((v, i, a) => a.indexOf(v) === i);
  const genre = String(item.representGenre || 'fantasy').toLowerCase();
  const slug = slugify(item.title);

  for (const lang of langs) {
    const url = `https://www.webtoons.com/${lang}/${genre}/${slug}/list?title_no=${item.titleNo}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const html = await res.text();
      const cover = html.match(/og:image[^>]+content="([^"]+)"/i)?.[1] ?? null;
      const raw = html.match(/<p class="summary"[^>]*>([\s\S]*?)<\/p>/i)?.[1];
      const summary = raw ? stripHtml(raw) : null;
      if (cover || summary) return { cover, summary };
    } catch {
      /* try next lang */
    }
  }
  return { cover: null, summary: null };
}
