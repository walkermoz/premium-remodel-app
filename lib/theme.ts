export type ThemePreference = "light" | "dark" | "system";
export const themeStorageKey = "premium-remodel-theme";
export const themeChangeEvent = "premium-remodel-theme-change";

export function validTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(themeStorageKey, preference);
  } catch {
    // The theme still works for this page when browser storage is unavailable.
  }
  applyTheme(preference);
}

// Apply before the first paint so saved dark mode never flashes a light page.
export const themeInitScript = `(()=>{let p="system";try{const s=localStorage.getItem("${themeStorageKey}");if(s==="light"||s==="dark")p=s}catch{}const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themePreference=p})();`;
