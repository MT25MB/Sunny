import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  /** Stable id, used to wire the toggle button to its panel. */
  id: string;
  /** Plain-text heading for the section. */
  title: string;
  /** Leading icon, shown next to the title. */
  icon: ReactNode;
  /** Whether the section body is currently showing. */
  open: boolean;
  /** Called when the header is activated. */
  onToggle: () => void;
  /**
   * Small illustration shown beside the title while the section is closed.
   * It is decorative: the title already says what the section is, so a
   * screen reader should not hear it twice.
   */
  mascotSrc?: string;
  /**
   * Extra controls rendered next to the title, outside the toggle button.
   * Used by the medication section for its "Add Reminder" button, which has
   * to stay reachable while the section is closed.
   */
  headerExtra?: ReactNode;
  /** Existing section styling (border, background) to keep. */
  className?: string;
  children: ReactNode;
}

/**
 * A section whose body can be folded away.
 *
 * The header is a real button with `aria-expanded` and `aria-controls`, and
 * the body is a labelled region that is removed from the tab order when
 * closed. A native <details>/<summary> was not used because the medication
 * header carries a second button, and interactive elements inside a
 * <summary> are invalid and behave inconsistently.
 */
export default function CollapsibleSection({
  id,
  title,
  icon,
  open,
  onToggle,
  mascotSrc,
  headerExtra,
  className,
  children,
}: CollapsibleSectionProps) {
  const buttonId = `${id}-toggle`;
  const panelId = `${id}-panel`;

  return (
    <section
      className={`collapsible-section ${open ? "open" : "closed"}${className ? ` ${className}` : ""}`}
      aria-labelledby={buttonId}
    >
      <div className="collapsible-header">
        <button
          type="button"
          id={buttonId}
          className="collapsible-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="collapsible-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="collapsible-title">{title}</span>
          {mascotSrc && !open && (
            <img src={mascotSrc} alt="" className="collapsible-mascot" aria-hidden="true" />
          )}
          <ChevronDown
            size={22}
            className={`collapsible-chevron${open ? " open" : ""}`}
            aria-hidden="true"
          />
        </button>
        {headerExtra}
      </div>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className="collapsible-panel"
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}