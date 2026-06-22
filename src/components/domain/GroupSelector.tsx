import type { Group } from "@/types";
import { cn } from "@/components/ui";

// Active-group picker shared across the dashboard tabs (promoted from a local
// component so admin/groups can reuse it). Renders nothing when the user has no
// groups. Keeps its own select styling (white/5 surface, emerald text) rather
// than the neutral <Select> primitive, to stay a faithful drop-in.
export type GroupSelectorProps = {
  groups: Group[];
  selectedGroup: Group | null;
  onChange: (groupId: string) => void;
  label: string;
  className?: string;
};

export function GroupSelector({
  groups,
  selectedGroup,
  onChange,
  label,
  className,
}: GroupSelectorProps) {
  if (groups.length === 0) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</label>
      <select
        value={selectedGroup?.id || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm font-bold text-primary-soft"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id} className="bg-neutral-950 text-white">
            {group.name} ({group.inviteCode})
          </option>
        ))}
      </select>
    </div>
  );
}
