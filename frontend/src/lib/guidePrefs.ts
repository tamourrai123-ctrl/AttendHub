import { useSyncExternalStore } from "react";

/** Remembers, in this browser only, whether guides are on and which screens' guides were closed. */
interface GuidePrefs {
  enabled: boolean;
  dismissed: string[];
}

const KEY = "attendhub.screenGuides";
const listeners = new Set<() => void>();
let current: GuidePrefs = read();

function read(): GuidePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuidePrefs>;
      return { enabled: parsed.enabled !== false, dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [] };
    }
  } catch {
    // Storage can be blocked; guides just start fresh each visit then.
  }
  return { enabled: true, dismissed: [] };
}

function write(next: GuidePrefs) {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGuidePrefs() {
  const prefs = useSyncExternalStore(subscribe, () => current);
  return {
    enabled: prefs.enabled,
    isDismissed: (path: string) => prefs.dismissed.includes(path),
    dismiss: (path: string) => write({ ...current, dismissed: [...new Set([...current.dismissed, path])] }),
    /** Bring one screen's guide back (and turn guides on if they were off). */
    reopen: (path: string) => write({ enabled: true, dismissed: current.dismissed.filter((p) => p !== path) }),
    setEnabled: (enabled: boolean) => write({ enabled, dismissed: enabled ? [] : current.dismissed }),
  };
}
