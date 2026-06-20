import { Plus, X } from "lucide-react";
import { useT } from "@/lib/i18n";

// A small list of text inputs with add/remove controls. Used for bulk-entering
// player names on the landing page (create) and the board (add players).
export function EditableList({
  title,
  items,
  placeholder,
  onChange,
  onAdd,
  onRemove,
  minItems,
}: {
  title: string;
  items: readonly string[];
  placeholder: (i: number) => string;
  onChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  minItems: number;
}) {
  const t = useT();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {title}
        </label>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs text-pitch hover:opacity-80"
        >
          <Plus className="size-3.5" /> {t.common.add}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((value, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={value}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={placeholder(i)}
              className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/20"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              disabled={items.length <= minItems}
              className="px-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30"
              aria-label={t.common.remove}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
