import { searchWebtoon } from './search-webtoon.js';
import { searchNovelFire } from './search-novelfire.js';
import { bestMatchScore, normalizeTitle } from './fuzzy.js';
import { listManhwa } from './db.js';

const ANILIST_URL = 'https://graphql.anilist.co';
const MANGADEX_URL = 'https://api.mangadex.org';

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const ANILIST_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      title { romaji english native }
      coverImage { extraLarge large medium }
      description(asHtml: false)
      countryOfOrigin
      format
      status
    }
  }
}
`;

function cacheKey(q) {
  return q.trim().toLowerCase();
}

function getCached(q) {
  const entry = cache.get(cacheKey(q));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(q));
    return null;
  }
  return entry.data;
}

function setCached(q, data) {
  cache.set(cacheKey(q), { at: Date.now(), data });
}

function inferType(format, country) {
  if (format === 'NOVEL') return 'light_novel';
  const c = String(country || '').toUpperCase();
  if (c === 'CN' || c === 'ZH' || c === 'ZH-HK') return 'manhua';
  if (c === 'KR' || c === 'KO') return 'manhwa';
  return null;
}

function pickTitle(titles) {
  return titles.english || titles.romaji || titles.native || 'Sans titre';
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

async function searchAniList(q) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { search: q },
    }),
  });

  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }

  const json = await res.json();
  const media = json?.data?.Page?.media ?? [];

  return media.map((m) => ({
    title: pickTitle(m.title),
    titles: [m.title.english, m.title.romaji, m.title.native].filter(Boolean),
    cover: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
    summary: m.description ? stripHtml(m.description).slice(0, 2000) : null,
    source: 'anilist',
    externalId: String(m.id),
    country: m.countryOfOrigin || null,
    format: m.format || null,
    suggestedType: inferType(m.format, m.countryOfOrigin),
  }));
}

async function searchMangaDex(q) {
  const url = new URL(`${MANGADEX_URL}/manga`);
  url.searchParams.set('title', q);
  url.searchParams.set('limit', '10');
  url.searchParams.append('includes[]', 'cover_art');
  url.searchParams.append('order[relevance]', 'desc');
  url.searchParams.append('contentRating[]', 'safe');
  url.searchParams.append('contentRating[]', 'suggestive');
  url.searchParams.append('contentRating[]', 'erotica');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`MangaDex HTTP ${res.status}`);
  }

  const json = await res.json();
  const list = json?.data ?? [];

  return list.map((m) => {
    const attrs = m.attributes || {};
    const titles = attrs.title || {};
    const alts = (attrs.altTitles || []).flatMap((o) => Object.values(o));
    const main =
      titles.en ||
      titles.ko ||
      titles.zh ||
      titles['zh-hk'] ||
      titles.ja ||
      Object.values(titles)[0] ||
      'Sans titre';

    const coverRel = (m.relationships || []).find((r) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const cover = fileName
      ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg`
      : null;

    const descObj = attrs.description || {};
    const summaryRaw =
      descObj.en || descObj.fr || Object.values(descObj)[0] || null;

    return {
      title: main,
      titles: [main, ...alts].filter(Boolean),
      cover,
      summary: summaryRaw ? stripHtml(summaryRaw).slice(0, 2000) : null,
      source: 'mangadex',
      externalId: m.id,
      country: attrs.originalLanguage || null,
      format: null,
      suggestedType: inferType(null, attrs.originalLanguage),
    };
  });
}

function mergeResults(query, webtoon, novelfire, anilist, mangadex) {
  const seen = new Set();
  const out = [];

  // Webtoon + NovelFire (LN) en priorité, puis AniList / MangaDex
  for (const item of [...webtoon, ...novelfire, ...anilist, ...mangadex]) {
    const key = normalizeTitle(item.title) || String(item.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    const altHit = (item.titles || []).some((t) => {
      const n = normalizeTitle(t) || String(t || '').toLowerCase();
      return n && seen.has(n);
    });
    if (altHit) continue;
    seen.add(key);
    for (const t of item.titles || []) {
      const n = normalizeTitle(t) || String(t || '').toLowerCase();
      if (n) seen.add(n);
    }

    const titles = [
      ...new Set(
        [item.title, ...(item.titles || [])]
          .map((t) => String(t || '').trim())
          .filter(Boolean)
      ),
    ];

    out.push({
      title: item.title,
      titles,
      cover: item.cover,
      summary: item.summary || null,
      source: item.source,
      externalId: item.externalId,
      country: item.country,
      format: item.format,
      suggestedType: item.suggestedType || null,
      _score: bestMatchScore(query, item.title, [], titles),
    });
  }

  // Re-rank fuzzy : les APIs ratent parfois l'ordre (fautes / noms alts)
  out.sort((a, b) => b._score - a._score || 0);

  return out.slice(0, 20).map(({ _score, ...rest }) => rest);
}

/** Variantes de requête pour tolérer accents / ponctuation. */
function queryVariants(q) {
  const base = String(q || '').trim();
  const variants = [base];
  const norm = normalizeTitle(base);
  if (norm && norm !== base.toLowerCase()) variants.push(norm);
  const noPunct = base.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (noPunct && noPunct !== base) variants.push(noPunct);
  return [...new Set(variants)].slice(0, 3);
}

/** Titres canoniques de la biblio qui matchent la requête (fautes / alias). */
function localTitleHints(query, limit = 3) {
  try {
    const scored = listManhwa()
      .map((row) => ({
        title: row.title,
        score: bestMatchScore(query, row.title, row.aliases || []),
      }))
      .filter((x) => x.score >= 45)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.title);
  } catch {
    return [];
  }
}

async function fetchAllSources(v) {
  const [w, n, a, m] = await Promise.allSettled([
    searchWebtoon(v),
    searchNovelFire(v),
    searchAniList(v),
    searchMangaDex(v),
  ]);
  if (w.status === 'rejected') console.warn('[search] Webtoon:', w.reason?.message);
  if (n.status === 'rejected') console.warn('[search] NovelFire:', n.reason?.message);
  if (a.status === 'rejected') console.warn('[search] AniList:', a.reason?.message);
  if (m.status === 'rejected') console.warn('[search] MangaDex:', m.reason?.message);
  return {
    webtoon: w.status === 'fulfilled' ? w.value : [],
    novelfire: n.status === 'fulfilled' ? n.value : [],
    anilist: a.status === 'fulfilled' ? a.value : [],
    mangadex: m.status === 'fulfilled' ? m.value : [],
  };
}

export async function searchManga(q) {
  const query = String(q || '').trim();
  if (query.length < 2) return [];

  const cached = getCached(query);
  if (cached) return cached;

  const variants = queryVariants(query);
  // Si la biblio a un titre proche (faute / autre langue), re-chercher avec le titre canonique
  for (const hint of localTitleHints(query)) {
    if (!variants.some((v) => normalizeTitle(v) === normalizeTitle(hint))) {
      variants.push(hint);
    }
  }

  const buckets = { webtoon: [], novelfire: [], anilist: [], mangadex: [] };

  for (const v of variants.slice(0, 4)) {
    const part = await fetchAllSources(v);
    buckets.webtoon.push(...part.webtoon);
    buckets.novelfire.push(...part.novelfire);
    buckets.anilist.push(...part.anilist);
    buckets.mangadex.push(...part.mangadex);

    const preview = mergeResults(
      query,
      buckets.webtoon,
      buckets.novelfire,
      buckets.anilist,
      buckets.mangadex
    );
    const best = preview.reduce(
      (m, item) => Math.max(m, bestMatchScore(query, item.title, [], item.titles || [])),
      0
    );
    if (best >= 70 && preview.length >= 5) break;
  }

  let merged = mergeResults(
    query,
    buckets.webtoon,
    buckets.novelfire,
    buckets.anilist,
    buckets.mangadex
  );

  // Écarte le bruit si on a déjà de bons matches
  const top = merged.reduce(
    (m, item) => Math.max(m, bestMatchScore(query, item.title, [], item.titles || [])),
    0
  );
  if (top >= 50) {
    merged = merged.filter(
      (item) => bestMatchScore(query, item.title, [], item.titles || []) >= 25
    );
  }

  setCached(query, merged);
  return merged;
}
