import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  CHAPTER_MAX,
  CHAPTER_UNKNOWN,
  STATUS_LABELS,
  TYPE_LABELS,
  type MediaType,
  type Status,
} from '../api';

type ChapterMode = 'number' | 'unknown' | 'finished';

interface FormState {
  title: string;
  coverPreview: string | null;
  last_chapter: string;
  comment: string;
  summary: string;
  score: number;
  status: Status;
  type: MediaType;
  aliases: string[];
}

type CoverChange =
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'data'; dataUrl: string }
  | { kind: 'remove' };

interface Props {
  mode: 'create' | 'edit';
  initial: FormState;
  onClose: () => void;
  readOnly?: boolean;
  onSave?: (payload: {
    title: string;
    last_chapter: string;
    comment: string;
    summary: string;
    score: number;
    status: Status;
    type: MediaType;
    aliases: string[];
    coverChange: CoverChange;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function detectChapterMode(last: string): ChapterMode {
  if (last === CHAPTER_UNKNOWN) return 'unknown';
  if (last === CHAPTER_MAX) return 'finished';
  return 'number';
}

export default function EditModal({
  mode,
  initial,
  onClose,
  onSave,
  onDelete,
  readOnly = false,
}: Props) {
  const [form, setForm] = useState(initial);
  const [aliasesText, setAliasesText] = useState(() => (initial.aliases || []).join(', '));
  const [chapterMode, setChapterMode] = useState<ChapterMode>(() =>
    detectChapterMode(initial.last_chapter)
  );
  const [chapterNumber, setChapterNumber] = useState(() => {
    const m = detectChapterMode(initial.last_chapter);
    return m === 'number' ? initial.last_chapter : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState(initial.coverPreview);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverChange, setCoverChange] = useState<CoverChange>({ kind: 'none' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function applyChapterMode(next: ChapterMode) {
    setChapterMode(next);
    if (next === 'finished') {
      setForm((f) => ({ ...f, status: 'termine', last_chapter: CHAPTER_MAX }));
    } else if (next === 'unknown') {
      setForm((f) => ({ ...f, last_chapter: CHAPTER_UNKNOWN }));
    } else {
      setForm((f) => ({ ...f, last_chapter: chapterNumber }));
    }
  }

  function applyCoverUrl() {
    const url = coverUrlInput.trim();
    if (!url) return;
    setCoverPreview(url);
    setCoverChange({ kind: 'url', url });
  }

  function onPickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Fichier image requis (PNG, JPEG, WebP…)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image max 5 Mo');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setCoverPreview(dataUrl);
      setCoverChange({ kind: 'data', dataUrl });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function clearCover() {
    setCoverPreview(null);
    setCoverUrlInput('');
    setCoverChange({ kind: 'remove' });
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || !onSave) return;
    if (!form.title.trim()) {
      setError('Titre requis');
      return;
    }

    let last_chapter = form.last_chapter;
    let status = form.status;

    if (chapterMode === 'unknown') {
      last_chapter = CHAPTER_UNKNOWN;
    } else if (chapterMode === 'finished') {
      last_chapter = CHAPTER_MAX;
      status = 'termine';
    } else {
      last_chapter = chapterNumber.trim();
    }

    setSaving(true);
    setError(null);
    try {
      const aliases = aliasesText
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      await onSave({
        title: form.title.trim(),
        last_chapter,
        comment: form.comment,
        summary: form.summary,
        score: form.score,
        status,
        type: form.type,
        aliases,
        coverChange,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  }

  const modes: { id: ChapterMode; label: string }[] = [
    { id: 'number', label: 'Numéro' },
    { id: 'unknown', label: 'Je ne sais pas' },
    { id: 'finished', label: 'Fini (chap max)' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-ink-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {readOnly ? 'Détails' : mode === 'create' ? 'Ajouter' : 'Modifier'}
            </h2>
            <p className="mt-1 text-sm text-white/45">
              {readOnly
                ? 'Consultation seule — connexion admin pour modifier.'
                : 'Note, chapitre, commentaire — sauvegarde immédiate en BDD.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/40 hover:bg-ink-700 hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="mx-auto w-32 shrink-0 sm:mx-0">
              <div className="h-48 overflow-hidden rounded-xl bg-ink-800">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-white/25">Pas de cover</div>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {!readOnly && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full rounded-lg bg-ink-800 px-2 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 hover:bg-ink-700"
                    >
                      Importer une image
                    </button>
                    <div className="flex gap-1">
                      <input
                        value={coverUrlInput}
                        onChange={(e) => setCoverUrlInput(e.target.value)}
                        placeholder="URL cover…"
                        className="field !py-1.5 !text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={applyCoverUrl}
                        className="shrink-0 rounded-lg bg-accent/20 px-2 text-[11px] text-accent hover:bg-accent/30"
                      >
                        OK
                      </button>
                    </div>
                    {coverPreview && (
                      <button
                        type="button"
                        onClick={clearCover}
                        className="w-full rounded-lg px-2 py-1 text-[11px] text-red-300/80 hover:bg-red-500/10"
                      >
                        Retirer la cover
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <Field label="Titre">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="field"
                  required
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </Field>

              <Field label="Alias / autres noms">
                {readOnly ? (
                  <p className="rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-sm text-white/70">
                    {(form.aliases || []).length
                      ? (form.aliases || []).join(' · ')
                      : 'Aucun alias'}
                  </p>
                ) : (
                  <>
                    <textarea
                      value={aliasesText}
                      onChange={(e) => setAliasesText(e.target.value)}
                      rows={2}
                      placeholder="Solo Leveling, 나 혼자만 레벨업, Ore dake Level Up… (virgules)"
                      className="field resize-y text-white/80"
                    />
                    <p className="mt-1 text-[11px] text-white/35">
                      Autres titres / langues — utilisés pour la recherche approximative.
                    </p>
                  </>
                )}
              </Field>

              <Field label="Type">
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as MediaType })}
                  className="field"
                  disabled={readOnly}
                >
                  {(Object.keys(TYPE_LABELS) as MediaType[]).map((k) => (
                    <option key={k} value={k}>
                      {TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>

              <div>
                <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
                  Dernier chapitre
                </span>
                {!readOnly && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {modes.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => applyChapterMode(m.id)}
                        className={`rounded-full px-3 py-1.5 text-xs transition ${
                          chapterMode === m.id
                            ? 'bg-accent font-medium text-ink-950'
                            : 'bg-ink-800 text-white/65 ring-1 ring-white/10 hover:bg-ink-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
                {chapterMode === 'number' ? (
                  <input
                    value={chapterNumber}
                    onChange={(e) => {
                      setChapterNumber(e.target.value);
                      setForm({ ...form, last_chapter: e.target.value });
                    }}
                    placeholder="ex. 142"
                    className="field"
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                ) : (
                  <p className="rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-sm text-white/55">
                    {chapterMode === 'unknown'
                      ? 'Chapitre enregistré comme « Inconnu ».'
                      : 'Marqué terminé — chapitre = max.'}
                  </p>
                )}
              </div>

              <Field label="Statut">
                <select
                  value={form.status}
                  onChange={(e) => {
                    const status = e.target.value as Status;
                    setForm({ ...form, status });
                    if (status === 'termine' && chapterMode === 'number' && !chapterNumber.trim()) {
                      applyChapterMode('finished');
                    } else if (status !== 'termine' && chapterMode === 'finished') {
                      applyChapterMode('number');
                    }
                  }}
                  className="field"
                  disabled={readOnly || chapterMode === 'finished'}
                >
                  {(Object.keys(STATUS_LABELS) as Status[]).map((k) => (
                    <option key={k} value={k}>
                      {STATUS_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={`Note : ${form.score}/20`}>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={form.score}
                  onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                  className="w-full accent-[var(--color-accent)]"
                  disabled={readOnly}
                />
                <div className="mt-1 flex justify-between text-[10px] text-white/30">
                  <span>0</span>
                  <span>10</span>
                  <span>20</span>
                </div>
              </Field>

              <Field label="Résumé">
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  rows={4}
                  placeholder="Synopsis (auto depuis Webtoon / AniList / MangaDex)…"
                  className="field resize-y text-white/80"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </Field>

              <Field label="Commentaire perso">
                <textarea
                  value={form.comment}
                  onChange={(e) => setForm({ ...form, comment: e.target.value })}
                  rows={3}
                  placeholder="Ton avis, notes perso…"
                  className="field resize-y"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-6 py-4">
          <div>
            {!readOnly && onDelete && (
              <button
                type="button"
                onClick={() => void onDelete()}
                className="rounded-xl px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-white/70 ring-1 ring-white/10 hover:bg-ink-700"
            >
              {readOnly ? 'Fermer' : 'Annuler'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-soft disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>
      </form>

      <style>{`
        .field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: #11141c;
          padding: 0.6rem 0.75rem;
          color: white;
          font-size: 0.875rem;
          outline: none;
        }
        .field:focus {
          border-color: rgba(255,107,74,0.5);
          box-shadow: 0 0 0 2px rgba(255,107,74,0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
