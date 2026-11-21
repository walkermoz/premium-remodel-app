"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  defaultOperatingSettings,
  operatingSettingsSchema,
  validateOperatingChange,
  type OperatingSection,
  type OperatingSettings,
} from "@/lib/operating-settings";

export type OperatingState = {
  settings: OperatingSettings;
  revision: number;
  storageReady: boolean;
};
const defaultState: OperatingState = {
  settings: defaultOperatingSettings(),
  revision: 0,
  storageReady: true,
};
const Context = createContext({
  ...defaultState,
  loaded: true,
} as OperatingState & {
  save: (section: OperatingSection, value: unknown) => Promise<void>;
  demo: boolean;
  loaded: boolean;
});
const demoKey = "servicebuddy-operating-settings-demo-v1";
export function OperatingSettingsProvider({
  initial = defaultState,
  demo = false,
  children,
}: {
  initial?: OperatingState;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [loaded, setLoaded] = useState(!demo);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const saving = useRef(false);
  useEffect(() => {
    if (!demo) return;
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(demoKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          const next = {
            settings: operatingSettingsSchema.parse(parsed.settings),
            revision: Number(parsed.revision) || 0,
            storageReady: true,
          };
          current.current = next;
          setState(next);
        }
      } catch {
        localStorage.removeItem(
          demoKey,
        ); /* Invalid demo data never affects live settings. */
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [demo]);
  async function save(section: OperatingSection, value: unknown) {
    if (saving.current)
      throw new Error("Wait for the previous settings save to finish.");
    saving.current = true;
    try {
      const nextSettings = validateOperatingChange(
        current.current.settings,
        section,
        value,
      );
      if (demo) {
        const stored = localStorage.getItem(demoKey);
        if (stored && JSON.parse(stored).revision !== current.current.revision)
          throw new Error(
            "Sample settings changed in another tab. Reload before saving.",
          );
        const next = {
          settings: nextSettings,
          revision: current.current.revision + 1,
          storageReady: true,
        };
        localStorage.setItem(demoKey, JSON.stringify(next));
        current.current = next;
        setState(next);
        return;
      }
      const response = await fetch("/api/operating-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          value,
          revision: current.current.revision,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not save settings.");
      const next = {
        settings: operatingSettingsSchema.parse(body.settings),
        revision: body.revision,
        storageReady: body.storageReady,
      };
      current.current = next;
      setState(next);
      window.dispatchEvent(new Event("premium-remodel-audit-updated"));
    } finally {
      saving.current = false;
    }
  }
  return (
    <Context.Provider value={{ ...state, save, demo, loaded }}>
      {children}
    </Context.Provider>
  );
}
export function useOperatingSettings() {
  const value = useContext(Context);
  return {
    ...value,
    save:
      value.save ||
      (async () => {
        throw new Error("Settings are unavailable outside the workspace.");
      }),
  };
}
