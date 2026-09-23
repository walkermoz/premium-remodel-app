"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Palette } from "lucide-react";
import {
  applyTheme,
  setThemePreference,
  themeChangeEvent,
  themeStorageKey,
  validTheme,
} from "@/lib/theme";

function subscribe(listener: () => void) {
  window.addEventListener(themeChangeEvent, listener);
  return () => window.removeEventListener(themeChangeEvent, listener);
}
function snapshot() {
  const { themePreference, theme } = document.documentElement.dataset;
  return `${validTheme(themePreference)}:${theme === "dark" ? "dark" : "light"}`;
}
function serverSnapshot() {
  return "system:light";
}
function useTheme() {
  const [preference, resolved] = useSyncExternalStore(
    subscribe,
    snapshot,
    serverSnapshot,
  ).split(":");
  return { preference: validTheme(preference), dark: resolved === "dark" };
}

export function ThemeController() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () =>
      applyTheme(validTheme(document.documentElement.dataset.themePreference));
    const syncStorage = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null)
        applyTheme(validTheme(event.newValue));
    };
    media.addEventListener("change", followSystem);
    window.addEventListener("storage", syncStorage);
    // A different tab may have changed the preference while this page hydrated.
    let preference = validTheme(
      document.documentElement.dataset.themePreference,
    );
    try {
      preference = validTheme(localStorage.getItem(themeStorageKey));
    } catch {
      // Retain the bootstrap preference when browser storage is unavailable.
    }
    applyTheme(preference);
    return () => {
      media.removeEventListener("change", followSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  return null;
}

export function ThemeToggle() {
  const { dark } = useTheme();
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setThemePreference(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

export function AppearanceSettings() {
  const { preference } = useTheme();
  return (
    <section className="settings-section" aria-labelledby="appearance-title">
      <div className="settings-title">
        <Palette size={22} />
        <div>
          <h2 id="appearance-title">Appearance</h2>
          <p>Choose your theme. Saved in this browser.</p>
        </div>
      </div>
      <div className="settings-details">
        <label>
          Color theme
          <select
            value={preference}
            onChange={(event) =>
              setThemePreference(validTheme(event.target.value))
            }
          >
            <option value="system">System — match your device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </section>
  );
}
