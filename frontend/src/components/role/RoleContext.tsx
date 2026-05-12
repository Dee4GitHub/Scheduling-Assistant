"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

// The current viewing context for the demo. No auth — this is purely the
// frontend's notion of "who am I right now". Used by the bell-icon to
// scope the notifications query, and by the technician schedule page
// to know which technician's schedule to load when the user navigates
// to /technician (without an id).
//
// Persisted to localStorage so a refresh doesn't dump the reviewer back
// to the role-picker. The Home page (/) deliberately ignores localStorage
// and always shows the picker on direct visit.

export type Role = "manager" | "technician";

export interface RoleSelection {
  readonly role: Role;
  readonly id: number;
}

interface RoleContextValue {
  readonly current: RoleSelection | null;
  setRole(selection: RoleSelection): void;
  clear(): void;
}

const STORAGE_KEY = "scheduling-assistant.role";

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { readonly children: React.ReactNode }) {
  const [current, setCurrent] = useState<RoleSelection | null>(null);

  // Hydrate from localStorage on mount. SSR-safe: useEffect only runs on the
  // client, so during render-on-server we ship `null` and the picker UI
  // appears on first paint. Once mounted, we read storage and re-render.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed = JSON.parse(raw) as RoleSelection;
      // Light validation — if the stored shape is wrong (e.g. an old format
      // from a previous deploy), drop it rather than crash on stale state.
      if (
        (parsed.role === "manager" || parsed.role === "technician") &&
        typeof parsed.id === "number" &&
        Number.isInteger(parsed.id) &&
        parsed.id > 0
      ) {
        setCurrent(parsed);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({
      current,
      setRole(selection) {
        setCurrent(selection);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
        } catch {
          // Quota / privacy mode — fail silently. The in-memory state still works.
        }
      },
      clear() {
        setCurrent(null);
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      },
    }),
    [current],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (ctx === undefined) {
    throw new Error("useRole must be used inside <RoleProvider>");
  }
  return ctx;
}
