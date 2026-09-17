export type Status = 'en_cours' | 'termine' | 'abandonne' | 'a_lire';
export type MediaType = 'manhwa' | 'manhua' | 'webcomic' | 'light_novel';

export interface Manhwa {
  id: number;
  title: string;
  cover_path: string | null;
  last_chapter: string;
  comment: string;
  score: number;
  status: Status;
  type: MediaType;
  source: string | null;
  external_id: string | null;
  summary: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  title: string;
  /** Titres alternatifs (autres langues / noms) */
  titles?: string[];
  cover: string | null;
  summary?: string | null;
  source: string;
  externalId: string;
  country?: string | null;
  format?: string | null;
  /** Suggestion de type média à partir de l'API (format / pays) */
  suggestedType?: MediaType | null;
}

export const STATUS_LABELS: Record<Status, string> = {
  en_cours: 'En cours',
  termine: 'Terminé',
  abandonne: 'Abandonné',
  a_lire: 'À lire',
};

export const TYPE_LABELS: Record<MediaType, string> = {
  manhwa: 'Manhwa',
  manhua: 'Manhua',
  webcomic: 'Webcomic',
  light_novel: 'Light Novel',
};

/** Classes Tailwind pour badges type (cartes, etc.) */
export const TYPE_BADGE: Record<MediaType, string> = {
  manhwa: 'bg-orange-500/20 text-orange-100 ring-1 ring-orange-400/35',
  manhua: 'bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/35',
  webcomic: 'bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/35',
  light_novel: 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/35',
};

/** Classes Tailwind pour badges statut */
export const STATUS_BADGE: Record<Status, string> = {
  en_cours: 'bg-sky-500/18 text-sky-100 ring-1 ring-sky-400/30',
  a_lire: 'bg-amber-500/18 text-amber-100 ring-1 ring-amber-400/30',
  termine: 'bg-emerald-500/18 text-emerald-100 ring-1 ring-emerald-400/30',
  abandonne: 'bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/35',
};

/** Sentinelles stockées dans last_chapter */
export const CHAPTER_UNKNOWN = 'inconnu';
export const CHAPTER_MAX = 'max';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE}${p}`;
}

export function formatChapter(lastChapter: string | null | undefined): string {
  const v = (lastChapter || '').trim();
  if (!v) return '—';
  if (v === CHAPTER_UNKNOWN) return 'Inconnu';
  if (v === CHAPTER_MAX) return 'Fini';
  return `Ch. ${v}`;
}

export function coverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return apiUrl(`covers/${path}`);
}

/** Note /20 → rang TierMaker */
export function scoreToTierLetter(score: number): string {
  const s = Math.max(0, Math.min(20, Math.round(score)));
  if (s >= 19) return 'S+';
  if (s >= 18) return 'S';
  if (s >= 16) return 'A';
  if (s >= 14) return 'B';
  if (s >= 12) return 'C';
  if (s >= 9) return 'D';
  if (s >= 6) return 'E';
  return 'F';
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error || `HTTP ${res.status}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

const cred: RequestInit = { credentials: 'include' };

export async function fetchAuthMe(): Promise<{ admin: boolean }> {
  return json(await fetch(apiUrl('api/auth/me'), cred));
}

export async function loginAdmin(password: string): Promise<{ ok: boolean; admin: boolean }> {
  return json(
    await fetch(apiUrl('api/auth/login'), {
      ...cred,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  );
}

export async function logoutAdmin(): Promise<void> {
  await json(await fetch(apiUrl('api/auth/logout'), { ...cred, method: 'POST' }));
}

export async function fetchManhwa(): Promise<Manhwa[]> {
  return json(await fetch(apiUrl('api/manhwa'), cred));
}

export async function searchTitles(q: string): Promise<SearchResult[]> {
  return json(await fetch(apiUrl(`api/search?q=${encodeURIComponent(q)}`), cred));
}

export async function createManhwa(payload: {
  title: string;
  coverUrl?: string | null;
  coverData?: string | null;
  source?: string | null;
  externalId?: string | null;
  last_chapter?: string;
  comment?: string;
  score?: number;
  status?: Status;
  type?: MediaType;
  summary?: string;
  aliases?: string[];
}): Promise<Manhwa> {
  return json(
    await fetch(apiUrl('api/manhwa'), {
      ...cred,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
}

export async function updateManhwa(
  id: number,
  payload: Partial<{
    title: string;
    last_chapter: string;
    comment: string;
    score: number;
    status: Status;
    type: MediaType;
    summary: string;
    aliases: string[];
    coverUrl: string | null;
    coverData?: string | null;
    removeCover?: boolean;
  }>
): Promise<Manhwa> {
  return json(
    await fetch(apiUrl(`api/manhwa/${id}`), {
      ...cred,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  );
}

export async function deleteManhwa(id: number): Promise<void> {
  await json(await fetch(apiUrl(`api/manhwa/${id}`), { ...cred, method: 'DELETE' }));
}
