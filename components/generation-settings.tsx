"use client";
import { useState } from "react";
import { WandSparkles } from "lucide-react";
import {
  demoGenerationKey,
  generationSettingsEvent,
  useGenerationConfig,
} from "./use-generation-config";
import ConnectionSetupGuide from "./connection-setup-guide";

export default function GenerationSettings({
  demo,
  admin,
}: {
  demo: boolean;
  admin: boolean;
}) {
  const { config, error, loading, refresh } = useGenerationConfig(demo);
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const model = selection ?? config?.defaultModel ?? "";
  return (
    <div id="connection-openrouter" className="settings-section">
      <div className="settings-title">
        <WandSparkles size={22} />
        <div>
          <h2>Generate</h2>
          <p>
            Choose the company default for renovation previews. You can select a
            different model for each image.
          </p>
        </div>
      </div>
      {error ? (
        <div className="alert" role="alert">
          {error}{" "}
          <button
            type="button"
            className="button secondary"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : (
        <form
          className="settings-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            setSaveError("");
            try {
              if (demo) localStorage.setItem(demoGenerationKey, model);
              else {
                const response = await fetch("/api/generate/config", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ defaultModel: model }),
                });
                const data = await response.json();
                if (!response.ok)
                  throw new Error(
                    data.error || "Could not save the default model.",
                  );
              }
              window.dispatchEvent(new Event(generationSettingsEvent));
              setMessage(
                demo
                  ? "Sample default saved in this browser."
                  : "Company default model saved.",
              );
            } catch (err) {
              setSaveError(
                err instanceof Error
                  ? err.message
                  : "Could not save the default model.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Default image model
            <select
              value={model}
              disabled={!admin || busy || loading || !config}
              onChange={(event) => {
                setSelection(event.target.value);
                setMessage("");
              }}
            >
              {!config && <option value="">Loading image models…</option>}
              {config && !config.models.some((item) => item.id === model) && (
                <option value={model} disabled>
                  Previous model unavailable — choose another
                </option>
              )}
              {config?.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {config &&
            (demo || config.configured ? (
              <p className="generation-note">
                {demo
                  ? "Image generation is available in your company workspace."
                  : "OpenRouter connected. Generation uses the platform’s OpenRouter credits."}
              </p>
            ) : (
              <ConnectionSetupGuide
                title="Waiting for AI provider setup"
                platform
                steps={[
                  "The ServiceBuddy platform administrator creates an OpenRouter API key.",
                  "Add the key to the app’s server configuration. It is not entered in a business workspace.",
                  "Once connected, choose the default image model here and try a preview in Generate.",
                ]}
                resources={[
                  {
                    label: "Create an OpenRouter key",
                    href: "https://openrouter.ai/settings/keys",
                  },
                ]}
              />
            ))}
          {admin ? (
            <button
              className="button primary"
              disabled={
                busy ||
                loading ||
                !config?.models.some((item) => item.id === model)
              }
            >
              {busy ? "Saving…" : "Save default model"}
            </button>
          ) : (
            <p className="generation-note">
              An administrator can change the company default.
            </p>
          )}
          {message && (
            <div className="success-note" role="status">
              {message}
            </div>
          )}
          {saveError && (
            <div className="alert" role="alert">
              {saveError}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
