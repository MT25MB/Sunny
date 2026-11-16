/**
 * Which parts of the app are currently unfolded.
 *
 * The window is small, so the sections are collapsed by default and the
 * user's choice is remembered between launches. Two sections start open:
 * System Health, because it is the first thing people look at, and Quick
 * Actions, because it is how they get anything done.
 */

export const SECTION_IDS = [
  'system-health',
  'quick-actions',
  'recipes',
  'medication',
  'digest',
  'activity',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type SectionState = Record<SectionId, boolean>;

const STORAGE_KEY = 'sunny_sections_v1';

export const defaultSectionState: SectionState = {
  'system-health': true,
  'quick-actions': true,
  recipes: false,
  medication: false,
  digest: false,
  activity: false,
};

export function loadSectionState(): SectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSectionState };
    const parsed = JSON.parse(raw) as Partial<SectionState>;
    const next = { ...defaultSectionState };
    for (const id of SECTION_IDS) {
      if (typeof parsed[id] === 'boolean') next[id] = parsed[id];
    }
    return next;
  } catch {
    return { ...defaultSectionState };
  }
}

export function saveSectionState(state: SectionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in some sandboxed contexts
  }
}