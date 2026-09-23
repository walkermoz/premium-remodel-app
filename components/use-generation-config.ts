"use client";
import { useCallback, useEffect, useState } from "react";
import {
  defaultGenerationModel,
  generationModels,
  type GenerationConfig,
} from "@/lib/generation";

export const demoGenerationKey = "premium-remodel-demo-generation-model";
export const generationSettingsEvent = "premium-remodel-generation-settings";

export function useGenerationConfig(demo: boolean, active = true) {
  const [config, setConfig] = useState<GenerationConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (demo) {
        setConfig({
          models: [...generationModels],
          defaultModel:
            localStorage.getItem(demoGenerationKey) || defaultGenerationModel,
          configured: false,
        });
      } else {
        const response = await fetch("/api/generate/config", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load image models.");
        setConfig(data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load image models.",
      );
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void refresh(), 0);
    const reload = () => void refresh();
    window.addEventListener(generationSettingsEvent, reload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(generationSettingsEvent, reload);
    };
  }, [active, refresh]);
  return { config, error, loading, refresh };
}
