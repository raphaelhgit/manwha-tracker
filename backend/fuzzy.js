/** Normalisation + matching approximatif titres / alias (multi-langues). */

export function normalizeTitle(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse aliases depuis JSON string ou array. */
export function parseAliases(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((s) => String(s || '').trim()).filter(Boolean))];
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map((s) => String(s || '').trim()).filter(Boolean))];
      }
    } catch {
      /* liste séparée par virgules / newlines */
      return [
        ...new Set(
          raw
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        ),
      ];
    }
  }
  return [];
}

export function serializeAliases(list) {
  const cleaned = parseAliases(list);
  return JSON.stringify(cleaned);
}

/** Tous les noms d'une œuvre (titre + aliases), dédupliqués. */
export function allNames(title, aliases) {
  const names = [String(title || '').trim(), ...parseAliases(aliases)].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const key = normalizeTitle(n) || n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const cur = new Array(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j];
  }
  return prev[cols - 1];
}

/**
 * Score 0–100 entre une requête et un titre.
 * Tolère fautes (Levenshtein), inclusions, tokens.
 */
export function matchScore(title, query) {
  const x = normalizeTitle(query);
  const y = normalizeTitle(title);
  if (!x || !y) {
    // scripts non-latins : compare brut en lowercase
    const xr = String(query || '').toLowerCase().trim();
    const yr = String(title || '').toLowerCase().trim();
    if (!xr || !yr) return 0;
    if (xr === yr) return 100;
    if (yr.includes(xr) || xr.includes(yr)) return 70;
    return 0;
  }
  if (x === y) return 100;
  if (y.startsWith(x) || x.startsWith(y)) return 85;
  if (y.includes(x) || x.includes(y)) {
    const ratio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
    return Math.round(55 + ratio * 25);
  }

  const xt = x.split(' ').filter(Boolean);
  const yt = y.split(' ').filter(Boolean);
  if (xt.length >= 2) {
    const hit = xt.filter((tok) => yt.some((w) => w === tok || w.startsWith(tok) || tok.startsWith(w)));
    if (hit.length === xt.length) return 75;
    if (hit.length >= Math.ceil(xt.length * 0.7)) return 55;
  }

  const maxLen = Math.max(x.length, y.length);
  if (maxLen <= 2) return 0;
  const dist = levenshtein(x, y);
  const allowed = maxLen <= 6 ? 1 : maxLen <= 12 ? 2 : Math.floor(maxLen * 0.2);
  if (dist <= allowed) {
    return Math.round(90 - (dist / Math.max(allowed, 1)) * 35);
  }

  // typo sur un token
  if (xt.length && yt.length) {
    let tokenHits = 0;
    for (const tok of xt) {
      if (yt.some((w) => w === tok || levenshtein(w, tok) <= (tok.length <= 5 ? 1 : 2))) {
        tokenHits += 1;
      }
    }
    if (tokenHits === xt.length && xt.length >= 2) return 65;
    if (tokenHits >= Math.ceil(xt.length * 0.75) && xt.length >= 2) return 45;
  }

  return 0;
}

/** Meilleur score parmi titre + aliases (+ titres API optionnels). */
export function bestMatchScore(query, title, aliases = [], extraTitles = []) {
  let best = 0;
  for (const n of allNames(title, aliases)) {
    best = Math.max(best, matchScore(n, query));
  }
  for (const n of extraTitles || []) {
    best = Math.max(best, matchScore(n, query));
  }
  return best;
}

/** True si la requête correspond suffisamment (seuil bibliothèque / dédup). */
export function titlesMatch(query, title, aliases = [], threshold = 40) {
  return bestMatchScore(query, title, aliases) >= threshold;
}

/** Alias à stocker = titres API ≠ titre principal. */
export function aliasesFromTitles(mainTitle, titles = []) {
  const main = normalizeTitle(mainTitle) || String(mainTitle || '').toLowerCase();
  return [
    ...new Set(
      (titles || [])
        .map((t) => String(t || '').trim())
        .filter((t) => t && (normalizeTitle(t) || t.toLowerCase()) !== main)
    ),
  ];
}
