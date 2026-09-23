"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Download, Smartphone, Check } from "lucide-react";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const InstallContext = createContext<{
  installed: boolean;
  prompt: InstallPrompt | null;
  clear: () => void;
}>({ installed: false, prompt: null, clear: () => {} });
export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false),
    [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        media.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const timer = setTimeout(update, 0);
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    media.addEventListener("change", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
      media.removeEventListener("change", update);
    };
  }, []);
  return (
    <InstallContext.Provider
      value={{ installed, prompt, clear: () => setPrompt(null) }}
    >
      {children}
    </InstallContext.Provider>
  );
}
export function InstallAppPanel() {
  const { installed, prompt, clear } = useContext(InstallContext);
  const [error, setError] = useState("");
  return (
    <section
      className="settings-section install-app"
      aria-label="Install Premium Remodel"
    >
      <div className="settings-title">
        <Smartphone size={22} />
        <div>
          <h2>Use on your phone</h2>
          <p>Add Premium Remodel to your home screen for quick access.</p>
        </div>
      </div>
      {installed ? (
        <p className="install-confirmation">
          <Check size={16} />
          You’re using the home-screen app.
        </p>
      ) : (
        <div className="install-instructions">
          {prompt && (
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await prompt.prompt();
                  await prompt.userChoice;
                  clear();
                } catch {
                  setError(
                    "Use your browser’s Add to Home Screen option below.",
                  );
                }
              }}
            >
              <Download size={16} />
              Install Premium Remodel
            </button>
          )}
          <p>
            <strong>iPhone:</strong> Open this site in Safari, tap Share, then
            Add to Home Screen. Keep Open as Web App enabled if shown.
          </p>
          <p>
            <strong>Android:</strong> Open this site in Chrome, tap the ⋮ menu,
            then Add to Home screen or Install app.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}
