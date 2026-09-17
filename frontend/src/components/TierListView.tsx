import type { Manhwa } from '../api';
import { coverUrl, scoreToTierLetter } from '../api';

export const TIER_ROWS = [
  { id: 'S+', label: 'S+', bg: '#ff7979', min: 19 },
  { id: 'S', label: 'S', bg: '#ffb142', min: 18 },
  { id: 'A', label: 'A', bg: '#ffda79', min: 16 },
  { id: 'B', label: 'B', bg: '#c8e6a5', min: 14 },
  { id: 'C', label: 'C', bg: '#dff9fb', min: 12 },
  { id: 'D', label: 'D', bg: '#badcff', min: 9 },
  { id: 'E', label: 'E', bg: '#dfe4ea', min: 6 },
  { id: 'F', label: 'F', bg: '#b2bec3', min: 0 },
] as const;

interface Props {
  items: Manhwa[];
  onSelect: (item: Manhwa) => void;
}

export default function TierListView({ items, onSelect }: Props) {
  const grouped = new Map<string, Manhwa[]>();
  for (const t of TIER_ROWS) grouped.set(t.id, []);

  for (const item of items) {
    const tier = scoreToTierLetter(item.score);
    grouped.get(tier)?.push(item);
  }

  for (const tier of TIER_ROWS) {
    grouped.get(tier.id)?.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  const withCover = items.filter((i) => coverUrl(i.cover_path)).length;

  return (
    <div className="overflow-hidden rounded-lg border border-black/20 shadow-xl">
      <div className="border-b border-black/10 bg-[#ececec] px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-black/70">Tier List · notes /20</p>
        <p className="text-xs text-black/45">
          {items.length} titre{items.length === 1 ? '' : 's'} · {withCover} covers
        </p>
      </div>

      <div className="bg-[#dcdcdc] p-2 sm:p-3">
        {TIER_ROWS.map((tier) => {
          const rowItems = grouped.get(tier.id) ?? [];
          return (
            <div
              key={tier.id}
              className="mb-2 flex min-h-[88px] overflow-hidden rounded-sm border border-black/15 bg-white last:mb-0"
            >
              <div
                className="flex w-[72px] shrink-0 items-center justify-center border-r border-black/10 sm:w-[88px]"
                style={{ backgroundColor: tier.bg }}
              >
                <span className="select-none text-2xl font-black tracking-tight text-black sm:text-3xl">
                  {tier.label}
                </span>
              </div>

              <div className="flex min-h-[88px] flex-1 flex-wrap items-center gap-1.5 p-1.5 sm:gap-2 sm:p-2">
                {rowItems.length === 0 ? (
                  <span className="px-2 text-xs text-black/25">—</span>
                ) : (
                  rowItems.map((item) => {
                    const src = coverUrl(item.cover_path);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item)}
                        title={`${item.title} (${item.score}/20)`}
                        className="group relative h-[76px] w-[52px] shrink-0 overflow-hidden rounded-sm border border-black/10 bg-[#eee] shadow-sm transition hover:ring-2 hover:ring-accent/80 sm:h-[80px] sm:w-[56px]"
                      >
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center bg-neutral-200 px-0.5 text-center">
                            <span className="line-clamp-3 text-[7px] font-semibold leading-tight text-black/55">
                              {item.title}
                            </span>
                          </div>
                        )}
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-0.5 pb-0.5 pt-3 text-[8px] font-medium leading-tight text-white opacity-0 transition group-hover:opacity-100">
                          {item.title}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-black/10 bg-[#ececec] px-4 py-2 text-[10px] text-black/45">
        F: 0–5 · E: 6–8 · D: 9–11 · C: 12–13 · B: 14–15 · A: 16–17 · S: 18 · S+: 19–20
      </div>
    </div>
  );
}
