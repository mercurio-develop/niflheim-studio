export type GridItem = { src: string; label?: string };

export function ImageGrid({
  items, picked, onPick, empty = 4, running = false,
}: {
  items: GridItem[];
  picked?: string | null;
  onPick?: (index: number) => void;
  empty?: number;
  running?: boolean;
}) {
  const cells: GridItem[] = items.length ? items : Array.from({ length: empty }, () => ({ src: "" }));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((item, i) =>
        item.src ? (
          <button
            key={item.src}
            type="button"
            onClick={() => onPick?.(i)}
            className={`group relative overflow-hidden rounded-[var(--radius)] border bg-surface ${
              picked === item.src ? "border-text" : "border-border hover:border-primary"
            }`}
          >
            <img src={item.src} alt={item.label || `Image ${i + 1}`} className="aspect-[7/9] w-full object-cover" />
            <span className="absolute bottom-2 left-2 rounded-[var(--radius)] border border-border bg-surface/80 px-1.5 font-mono text-[11px] text-muted">
              {picked === item.src ? "picked" : item.label || String(i + 1).padStart(2, "0")}
            </span>
          </button>
        ) : (
          <div
            key={i}
            className={`aspect-[7/9] rounded-[var(--radius)] border border-border bg-surface/60${running ? " animate-pulse" : ""}`}
          />
        ),
      )}
    </div>
  );
}

export default ImageGrid;
