import { type FormEvent, useRef, useState } from 'react';
import { loginAdmin } from '../api';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

function isTouchUi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export default function LoginPanel({ onSuccess, onCancel }: Props) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(isTouchUi);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '');
    if (!password) {
      setError('Mot de passe requis');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loginAdmin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  async function pastePassword() {
    setPasteHint(null);
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setPasteHint('Presse-papiers vide — copie le MDP dans KeePass puis réessaie.');
        return;
      }
      const el = passwordRef.current;
      if (!el) return;
      el.focus();
      // Non contrôlé : écriture directe (React value= bloque souvent le collage mobile)
      el.value = text;
      el.setSelectionRange(text.length, text.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setPasteHint('Mot de passe collé.');
    } catch {
      setPasteHint(
        'Accès presse-papiers refusé. Sur Android : KeePass → partage/copie, puis bouton Coller, ou saisie en clair (Voir).'
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Fermer"
        onClick={onCancel}
      />
      <form
        method="post"
        action="https://hraphael.com/manwha/"
        name="manwha-admin-login"
        id="manwha-admin-login"
        autoComplete="on"
        onSubmit={(e) => void submit(e)}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white">Admin</h2>
        <p className="mt-1 text-sm text-white/45">
          Mot de passe pour ajouter ou modifier. Collage et KeePass OK.
        </p>

        {/* Username visible : KeePass / autofill Android le détectent mal s’il est caché */}
        <label className="mt-5 block" htmlFor="manwha-admin-username">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Identifiant
          </span>
          <input
            id="manwha-admin-username"
            name="username"
            type="text"
            defaultValue="admin"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-3 text-base text-white outline-none focus:border-accent/50"
          />
        </label>

        <label className="mt-4 block" htmlFor="manwha-admin-password">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45 uppercase">
            Mot de passe
          </span>
          {/*
            Champ NON contrôlé (pas de value= React) : sinon iOS/Android
            bloquent collage + autofill KeePass.
            Sur tactile : type=text par défaut (type=password coupe souvent le collage).
          */}
          <input
            ref={passwordRef}
            id="manwha-admin-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            required
            className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-3 text-base text-white outline-none focus:border-accent/50"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void pastePassword()}
            className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-white/80 ring-1 ring-white/10 hover:bg-ink-700"
          >
            Coller
          </button>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-white/80 ring-1 ring-white/10 hover:bg-ink-700"
          >
            {showPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>

        {(pasteHint || error) && (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              error
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-white/10 bg-ink-800 text-white/60'
            }`}
          >
            {error || pasteHint}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-white/70 ring-1 ring-white/10 hover:bg-ink-700"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-accent-soft disabled:opacity-60"
          >
            {loading ? '…' : 'Connexion'}
          </button>
        </div>
      </form>
    </div>
  );
}
