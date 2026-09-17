import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  Manhwa,
  MediaType,
  Status,
  STATUS_LABELS,
  TYPE_LABELS,
  coverUrl,
  createManhwa,
  deleteManhwa,
  fetchAuthMe,
  fetchManhwa,
  logoutAdmin,
  updateManhwa,
  type SearchResult,
} from './api';
import { aliasesFromTitles, bestMatchScore } from './fuzzy';
import MangaCard from './components/MangaCard';
import SearchBox from './components/SearchBox';
import EditModal from './components/EditModal';
import TierListView from './components/TierListView';
import LoginPanel from './components/LoginPanel';

type ViewMode = 'grid' | 'tierlist';
type Filter = 'all' | Status;
type TypeFilter = 'all' | MediaType;
type Sort = 'updated' | 'score' | 'title';

type AddDraft = {
  title: string;
  cover: string | null;
  source: string | null;
  externalId: string | null;
  type: MediaType;
  summary: string;
  aliases: string[];
};

export default function App() {
  const [list, setList] = useState<Manhwa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Manhwa | null>(null);
  const [adding, setAdding] = useState<AddDraft | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchManhwa();
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const me = await fetchAuthMe();
      setIsAdmin(me.admin);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void refreshAuth();
  }, [reload, refreshAuth]);

  const visible = useMemo(() => {
    let rows = [...list];
    if (filter !== 'all') rows = rows.filter((r) => r.status === filter);
    if (typeFilter !== 'all') rows = rows.filter((r) => r.type === typeFilter);
    if (query.trim()) {
      const q = query.trim();
      rows = rows.filter((r) => bestMatchScore(q, r.title, r.aliases || []) >= 40);
    }
    rows.sort((a, b) => {
      if (query.trim()) {
        const sa = bestMatchScore(query.trim(), a.title, a.aliases || []);
        const sb = bestMatchScore(query.trim(), b.title, b.aliases || []);
        if (sb !== sa) return sb - sa;
      }
      if (sort === 'score') return b.score - a.score || a.title.localeCompare(b.title);
      if (sort === 'title') return a.title.localeCompare(b.title);
      return b.updated_at.localeCompare(a.updated_at);
    });
    return rows;
  }, [list, filter, typeFilter, sort, query]);

  const stats = useMemo(() => {
    const avg =
      list.length === 0
        ? 0
        : Math.round((list.reduce((s, r) => s + r.score, 0) / list.length) * 10) / 10;
    return { total: list.length, avg };
  }, [list]);

  function handleSelectSuggestion(s: SearchResult) {
    setAdding({
      title: s.title,
      cover: s.cover,
      source: s.source,
      externalId: s.externalId,
      type: s.suggestedType || (s.source === 'novelfire' ? 'light_novel' : 'manhwa'),
      summary: s.summary || '',
      aliases: aliasesFromTitles(s.title, s.titles || []),
    });
  }

  function handleManualAdd(title: string) {
    setAdding({
      title,
      cover: null,
      source: 'manual',
      externalId: null,
      type: 'manhwa',
      summary: '',
      aliases: [],
    });
  }

  function handleAuthError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      setIsAdmin(false);
      setShowLogin(true);
      setError('Session expirée — reconnecte-toi pour modifier.');
      return true;
    }
    return false;
  }

  async function handleCreate(payload: {
    title: string;
    last_chapter: string;
    comment: string;
    score: number;
    status: Status;
    type: MediaType;
    summary: string;
    aliases: string[];
    coverChange: { kind: string; url?: string; dataUrl?: string };
  }) {
    if (!adding) return;
    const coverPayload =
      payload.coverChange.kind === 'data'
        ? { coverData: payload.coverChange.dataUrl }
        : payload.coverChange.kind === 'url'
          ? { coverUrl: payload.coverChange.url, source: 'manual' as const }
          : payload.coverChange.kind === 'remove'
            ? {}
            : {
                coverUrl: adding.cover,
                source: adding.source,
                externalId: adding.externalId,
              };

    try {
      await createManhwa({
        title: payload.title,
        last_chapter: payload.last_chapter,
        comment: payload.comment,
        score: payload.score,
        status: payload.status,
        type: payload.type,
        summary: payload.summary,
        aliases: payload.aliases.length ? payload.aliases : adding.aliases,
        ...coverPayload,
      });
      setAdding(null);
      await reload();
    } catch (e) {
      if (!handleAuthError(e)) throw e;
    }
  }

  async function handleUpdate(
    id: number,
    payload: {
      title: string;
      last_chapter: string;
      comment: string;
      score: number;
      status: Status;
      type: MediaType;
      summary: string;
      aliases: string[];
      coverChange: { kind: string; url?: string; dataUrl?: string };
    }
  ) {
    const coverPatch =
      payload.coverChange.kind === 'data'
        ? { coverData: payload.coverChange.dataUrl }
        : payload.coverChange.kind === 'url'
          ? { coverUrl: payload.coverChange.url, source: 'manual' }
          : payload.coverChange.kind === 'remove'
            ? { removeCover: true }
            : {};

    try {
      await updateManhwa(id, {
        title: payload.title,
        last_chapter: payload.last_chapter,
        comment: payload.comment,
        score: payload.score,
        status: payload.status,
        type: payload.type,
        summary: payload.summary,
        aliases: payload.aliases,
        ...coverPatch,
      });
      setEditing(null);
      await reload();
    } catch (e) {
      if (!handleAuthError(e)) throw e;
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Supprimer cette entrée ?')) return;
    try {
      await deleteManhwa(id);
      setEditing(null);
      await reload();
    } catch (e) {
      if (!handleAuthError(e)) {
        setError(e instanceof Error ? e.message : 'Suppression impossible');
      }
    }
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
    } finally {
      setIsAdmin(false);
      setAdding(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium tracking-widest text-accent uppercase">
            Homelab · Z2
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Manwha Tracker
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            Notes /20, chapitre, synopsis — Webtoon, NovelFire, AniList & MangaDex.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-ink-800 px-3 py-1 text-white/70 ring-1 ring-white/10">
              {stats.total} titre{stats.total === 1 ? '' : 's'}
            </span>
            <span className="rounded-full bg-ink-800 px-3 py-1 text-gold ring-1 ring-white/10">
              Moyenne {stats.avg}/20
            </span>
            <div className="flex rounded-full bg-ink-800 p-0.5 ring-1 ring-white/10">
              {(
                [
                  ['grid', 'Grille'],
                  ['tierlist', 'Tier list'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    view === key
                      ? 'bg-accent font-medium text-ink-950'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-full bg-ink-800 px-3 py-1 text-xs text-white/55 ring-1 ring-white/10 hover:text-white"
              >
                Déconnexion
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogin(true)}
                className="rounded-full bg-ink-800 px-3 py-1 text-xs text-white/40 ring-1 ring-white/10 hover:text-white/70"
              >
                Admin
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="w-full max-w-xl">
            <SearchBox onSelect={handleSelectSuggestion} onManualAdd={handleManualAdd} />
          </div>
        )}
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'Tous'],
              ['en_cours', STATUS_LABELS.en_cours],
              ['a_lire', STATUS_LABELS.a_lire],
              ['termine', STATUS_LABELS.termine],
              ['abandonne', STATUS_LABELS.abandonne],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                filter === key
                  ? 'bg-accent text-ink-950 font-medium'
                  : 'bg-ink-800 text-white/70 hover:bg-ink-700 ring-1 ring-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer (titre, alias, fautes OK)…"
            className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:border-accent/50 sm:w-52"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
          >
            <option value="all">Tous types</option>
            {(Object.keys(TYPE_LABELS) as MediaType[]).map((k) => (
              <option key={k} value={k}>
                {TYPE_LABELS[k]}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
          >
            <option value="updated">Récents</option>
            <option value="score">Note</option>
            <option value="title">Titre</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-24 text-white/50">Chargement…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-ink-900/50 px-6 py-16 text-center">
          <p className="text-lg text-white/80">Aucun manwha pour l’instant</p>
          <p className="mt-2 text-sm text-white/45">
            {isAdmin
              ? 'Recherche un titre, ou ajoute-le manuellement s’il n’est pas trouvé.'
              : 'La liste est vide pour le moment.'}
          </p>
        </div>
      ) : view === 'tierlist' ? (
        <TierListView items={visible} onSelect={setEditing} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((m) => (
            <MangaCard key={m.id} item={m} onClick={() => setEditing(m)} />
          ))}
        </div>
      )}

      {adding && isAdmin && (
        <EditModal
          mode="create"
          initial={{
            title: adding.title,
            coverPreview: adding.cover,
            last_chapter: '',
            comment: '',
            score: 10,
            status: 'en_cours',
            type: adding.type,
            summary: adding.summary,
            aliases: adding.aliases,
          }}
          onClose={() => setAdding(null)}
          onSave={handleCreate}
        />
      )}

      {editing && (
        <EditModal
          mode="edit"
          readOnly={!isAdmin}
          initial={{
            title: editing.title,
            coverPreview: coverUrl(editing.cover_path),
            last_chapter: editing.last_chapter,
            comment: editing.comment,
            score: editing.score,
            status: editing.status,
            type: editing.type,
            summary: editing.summary || '',
            aliases: editing.aliases || [],
          }}
          onClose={() => setEditing(null)}
          onSave={isAdmin ? (payload) => handleUpdate(editing.id, payload) : undefined}
          onDelete={isAdmin ? () => handleDelete(editing.id) : undefined}
        />
      )}

      {showLogin && (
        <LoginPanel
          onCancel={() => setShowLogin(false)}
          onSuccess={() => {
            setShowLogin(false);
            setIsAdmin(true);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
