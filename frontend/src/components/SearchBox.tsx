import { useEffect, useMemo, useRef, useState } from 'react';
import { searchTitles, TYPE_LABELS, type MediaType, type SearchResult } from '../api';

type SearchSectionId = 'webtoon' | 'comics' | 'novels';

const SEARCH_SECTIONS: { id: SearchSectionId; label: string }[] = [
  { id: 'webtoon', label: 'Webtoon officiels' },
  { id: 'comics', label: 'Manhwa & webcomics' },
  { id: 'novels', label: 'Light novels' },
];

function classifyResult(r: SearchResult): SearchSectionId {
  if (r.source === 'webtoon') return 'webtoon';
  if (r.source === 'novelfire' || r.suggestedType === 'light_novel' || r.format === 'NOVEL')
    return 'novels';
  return 'comics';
}

function resolveType(r: SearchResult): MediaType | null {
  if (r.suggestedType) return r.suggestedType;
  if (r.source === 'novelfire' || r.format === 'NOVEL') return 'light_novel';
  if (r.source === 'webtoon') return 'manhwa';
  return null;
}

interface Props {
  onSelect: (result: SearchResult) => void;
  onManualAdd: (title: string) => void;
}

export default function SearchBox({ onSelect, onManualAdd }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setErr(null);
      return;
    }

    setLoading(true);
    setErr(null);
    const t = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const data = await searchTitles(trimmed);
        if (!ac.signal.aborted) {
          setResults(data);
          setOpen(true);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setErr(e instanceof Error ? e.message : 'Erreur recherche');
          setResults([]);
          setOpen(true);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 320);

    return () => window.clearTimeout(t);
  }, [q]);

  function clearInput() {
    setQ('');
    setResults([]);
    setOpen(false);
  }

  function pick(r: SearchResult) {
    onSelect(r);
    clearInput();
  }

  function addManual() {
    const title = q.trim();
    if (!title) return;
    onManualAdd(title);
    clearInput();
  }

  const groupedResults = useMemo(() => {
    const groups: Record<SearchSectionId, SearchResult[]> = {
      webtoon: [],
      comics: [],
      novels: [],
    };
    for (const r of results) {
      groups[classifyResult(r)].push(r);
    }
    return SEARCH_SECTIONS.map((section) => ({
      ...section,
      items: groups[section.id],
    })).filter((section) => section.items.length > 0);
  }, [results]);

  const showDropdown = open && q.trim().length >= 1;
  const showManual =
    q.trim().length >= 1 && (!loading || results.length === 0 || err !== null);

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
        Ajouter un manwha
      </label>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length >= 1) setOpen(true);
          }}
          onFocus={() => q.trim().length >= 1 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results.length === 1) pick(results[0]);
              else if (q.trim()) addManual();
            }
          }}
          placeholder="Tape un titre… (Solo Leveling, Tower of God…)"
          className="w-full rounded-2xl border border-white/10 bg-ink-900/90 py-3.5 pl-4 pr-12 text-sm text-white shadow-lg shadow-black/20 outline-none placeholder:text-white/30 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          autoComplete="off"
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-white/35">
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
          )}
        </div>
      </div>

      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}

      {showDropdown && (
        <ul className="absolute z-30 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur">
          {groupedResults.map((section, sectionIdx) => (
            <li key={section.id} className={sectionIdx > 0 ? 'mt-1 border-t border-white/10 pt-1' : ''}>
              <div
                className={`sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 backdrop-blur ${
                  section.id === 'novels'
                    ? 'bg-violet-950/90 text-violet-200/80'
                    : section.id === 'webtoon'
                      ? 'bg-emerald-950/90 text-emerald-200/80'
                      : 'bg-ink-900/95 text-accent/85'
                }`}
              >
                <span className="text-[10px] font-semibold tracking-wider uppercase">
                  {section.label}
                </span>
                <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-medium text-white/45">
                  {section.items.length}
                </span>
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {section.items.map((r) => {
                  const mediaType = resolveType(r);
                  return (
                    <li key={`${r.source}-${r.externalId}`}>
                      <button
                        type="button"
                        onClick={() => pick(r)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-ink-700"
                      >
                        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink-800">
                          {r.cover ? (
                            <img src={r.cover} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full place-items-center text-[9px] text-white/25">
                              N/A
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                              {r.title}
                            </p>
                            {mediaType && (
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase ${
                                  mediaType === 'light_novel'
                                    ? 'bg-violet-500/15 text-violet-200/75'
                                    : 'bg-white/8 text-white/55'
                                }`}
                              >
                                {TYPE_LABELS[mediaType]}
                              </span>
                            )}
                          </div>
                          {r.titles && r.titles.filter((t) => t !== r.title).length > 0 && (
                            <p className="mt-0.5 truncate text-[11px] text-white/40">
                              {r.titles
                                .filter((t) => t !== r.title)
                                .slice(0, 3)
                                .join(' · ')}
                            </p>
                          )}
                          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-white/40">
                            {r.source === 'webtoon'
                              ? 'webtoon · officiel'
                              : r.source === 'novelfire'
                                ? 'novelfire · LN'
                                : r.source}
                            {r.country ? ` · ${r.country}` : ''}
                          </p>
                          {r.summary && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-white/45">{r.summary}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}

          {!loading && results.length === 0 && q.trim().length >= 2 && !err && (
            <li className="px-3 py-2 text-sm text-white/40">Aucun résultat API</li>
          )}

          {showManual && (
            <li className={results.length > 0 ? 'mt-1 border-t border-white/8 pt-1' : ''}>
              <button
                type="button"
                onClick={addManual}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink-700"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/15 text-accent text-lg font-semibold">
                  +
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    Ajouter « {q.trim()} » manuellement
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">Sans couverture auto</p>
                </div>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
