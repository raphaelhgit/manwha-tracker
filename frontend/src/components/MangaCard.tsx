import { coverUrl, formatChapter, STATUS_BADGE, STATUS_LABELS, TYPE_BADGE, TYPE_LABELS, type Manhwa } from '../api';

interface Props {
  item: Manhwa;
  onClick: () => void;
}

function scoreColor(score: number): string {
  if (score >= 16) return 'text-mint';
  if (score >= 12) return 'text-gold';
  if (score >= 8) return 'text-accent-soft';
  return 'text-white/50';
}

export default function MangaCard({ item, onClick }: Props) {
  const cover = coverUrl(item.cover_path);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl bg-ink-900 text-left ring-1 ring-white/8 transition hover:-translate-y-1 hover:ring-accent/40 hover:shadow-[0_20px_40px_-20px_rgba(255,107,74,0.45)]"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-ink-800">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-white/25 text-sm">Pas de cover</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent p-3 pt-12">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{item.title}</p>
        </div>
        <div
          className={`absolute right-2 top-2 rounded-lg bg-ink-950/80 px-2 py-1 text-sm font-semibold backdrop-blur ${scoreColor(item.score)}`}
        >
          {item.score}
          <span className="text-[10px] font-normal text-white/40">/20</span>
        </div>
        <div
          className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur ${TYPE_BADGE[item.type]}`}
        >
          {TYPE_LABELS[item.type]}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs text-white/50">
        <span className="truncate">{formatChapter(item.last_chapter)}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[item.status]}`}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>
    </button>
  );
}
