import * as React from "react";
import { Lock, Circle, CheckCircle2, ArrowRightCircle } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * StageMap — left rail listing of stages with unlocked/current/locked states.
 *
 * Anti-pattern: locked stages must NOT reveal stage content
 * (`docs/FRONTEND.md` section 10).
 */
export type StageMapItemStatus =
  | "completed"
  | "current"
  | "unlocked"
  | "locked";

export interface StageMapItem {
  id: string;
  title: string;
  status: StageMapItemStatus;
  /** When status === "locked", a short rule label like "Complete stage 3". */
  unlockRule?: string;
}

export interface StageMapProps {
  items: StageMapItem[];
  currentId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

const ICONS: Record<
  StageMapItemStatus,
  React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
> = {
  completed: CheckCircle2,
  current: ArrowRightCircle,
  unlocked: Circle,
  locked: Lock,
};

export function StageMap({
  items,
  currentId,
  onSelect,
  className,
}: StageMapProps) {
  return (
    <nav className={cn("py-2", className)} aria-label="Stages">
      <ol className="flex flex-col">
        {items.map((item) => {
          const Icon = ICONS[item.status];
          const isCurrent = item.id === currentId || item.status === "current";
          const isLocked = item.status === "locked";
          // Icon tint logic:
          //  - completed → green icon-accent (signals "passed").
          //  - current   → green icon-accent (signals "this is your next action").
          //  - unlocked  → coral accent (still a primary affordance, just not active).
          //  - locked    → muted gray (we never paint locked stages green).
          const iconTone =
            item.status === "completed" || item.status === "current"
              ? "text-(--color-rc-icon-accent)"
              : isLocked
              ? "text-(--color-rc-locked)"
              : "text-(--color-rc-accent)";
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => onSelect?.(item.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-(--text-rc-sm)",
                  "border-l-2",
                  isCurrent
                    ? "border-(--color-rc-accent) bg-(--color-rc-accent-subtle) text-(--color-rc-text)"
                    : "border-transparent text-(--color-rc-text-muted)",
                  isLocked
                    ? "cursor-not-allowed opacity-70"
                    : "hover:bg-(--color-rc-surface-muted) hover:text-(--color-rc-text)",
                )}
              >
                <Icon size={14} aria-hidden className={iconTone} />
                <span className="flex-1 truncate">{item.title}</span>
                {isLocked && item.unlockRule ? (
                  <span className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                    {item.unlockRule}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
