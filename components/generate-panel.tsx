"use client";
import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  Camera,
  Upload,
  WandSparkles,
  Download,
  ImagePlus,
  Check,
  LoaderCircle,
  ArrowLeftRight,
} from "lucide-react";
import {
  generationProjectTypes,
  renovationStyles,
  stylesForProject,
} from "@/lib/generation";
import { useGenerationConfig } from "./use-generation-config";
import { prepareGenerationFile } from "@/lib/generation-client";

export default function GeneratePanel({
  demo,
  active,
}: {
  demo: boolean;
  active: boolean;
}) {
  const {
    config,
    error: configError,
    loading,
    refresh,
  } = useGenerationConfig(demo, active);
  const [projectType, setProjectType] = useState("bathroom");
  const [otherProject, setOtherProject] = useState("");
  const [styleId, setStyleId] = useState("modern");
  const [modelOverride, setModelOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<{
    file: File;
    url: string;
    name: string;
  } | null>(null);
  const [result, setResult] = useState<{
    url: string;
    label: string;
    model: string;
    fileName: string;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comparisonView, setComparisonView] = useState<"drag" | "stacked">(
    "drag",
  );
  const [split, setSplit] = useState(50);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const previewPanel = useRef<HTMLDivElement>(null);
  const comparisonCanvas = useRef<HTMLDivElement>(null);
  const activeComparisonPointer = useRef<number | null>(null);
  const errorMessage = useRef<HTMLDivElement>(null);
  const uploadVersion = useRef(0);
  const request = useRef<AbortController | null>(null);
  const project = generationProjectTypes.find(
    (item) => item.id === projectType,
  )!;
  const styles = stylesForProject(projectType);
  const model = modelOverride || config?.defaultModel || "";
  const modelAvailable = config?.models.some((item) => item.id === model);

  function updateSplitFromPointer(clientX: number) {
    const bounds = comparisonCanvas.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return;
    const nextSplit = ((clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(100, Math.max(0, nextSplit)));
  }

  function startComparisonDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (comparisonView !== "drag") return;
    activeComparisonPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSplitFromPointer(event.clientX);
    event.preventDefault();
  }

  function moveComparisonDivider(event: ReactPointerEvent<HTMLDivElement>) {
    if (activeComparisonPointer.current !== event.pointerId) return;
    updateSplitFromPointer(event.clientX);
  }

  function stopComparisonDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activeComparisonPointer.current !== event.pointerId) return;
    activeComparisonPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function moveComparisonWithKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    const steps: Record<string, number> = {
      ArrowLeft: -2,
      ArrowDown: -2,
      ArrowRight: 2,
      ArrowUp: 2,
    };
    if (event.key === "Home" || event.key === "End") {
      setSplit(event.key === "Home" ? 0 : 100);
      event.preventDefault();
      return;
    }
    if (steps[event.key] === undefined) return;
    setSplit((current) =>
      Math.min(100, Math.max(0, current + steps[event.key])),
    );
    event.preventDefault();
  }
  useEffect(() => {
    if (error && active && window.innerWidth <= 760)
      errorMessage.current?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [error, active]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(
    () => () => {
      uploadVersion.current++;
      request.current?.abort();
    },
    [],
  );

  async function selectPhoto(file?: File) {
    if (!file || busy) return;
    const version = ++uploadVersion.current;
    setPreparing(true);
    setError("");
    try {
      const resized = await prepareGenerationFile(file);
      if (version !== uploadVersion.current) return;
      setPhoto({
        file: resized,
        url: URL.createObjectURL(resized),
        name: file.name,
      });
      setResult(null);
    } catch (err) {
      if (version === uploadVersion.current)
        setError(
          err instanceof Error
            ? err.message
            : "This photo could not be read. Try another image.",
        );
    } finally {
      if (version === uploadVersion.current) setPreparing(false);
    }
  }

  async function generate() {
    if (!photo || busy || preparing) return;
    setError("");
    if (demo) {
      setError(
        "Sign in to your company workspace to generate a renovation preview.",
      );
      return;
    }
    if (!modelAvailable) {
      setError("Choose an available image model.");
      return;
    }
    setBusy(true);
    if (window.innerWidth <= 760)
      previewPanel.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    const controller = new AbortController();
    request.current = controller;
    try {
      const form = new FormData();
      form.set("photo", photo.file);
      form.set("projectType", projectType);
      form.set("otherProject", otherProject);
      form.set("style", styleId);
      form.set("model", model);
      form.set("notes", notes);
      const response = await fetch("/api/generate", {
        method: "POST",
        body: form,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(270000),
        ]),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "Could not generate the preview. Please try again.",
        );
      }
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error(
          "The model returned no image. Please try another model.",
        );
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const style = renovationStyles.find((item) => item.id === styleId)!;
      setResult({
        url: URL.createObjectURL(blob),
        label: `${projectType === "other" ? otherProject : project.name} · ${style.name}`,
        model: config?.models.find((item) => item.id === model)?.name || model,
        fileName: `premium-remodel-${projectType}-${styleId}.jpg`,
      });
      setComparisonView("drag");
      setSplit(50);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error && err.name === "TimeoutError"
            ? "The model took too long. Please try again or select another model."
            : err instanceof Error
              ? err.message
              : "Could not generate the preview.",
        );
    } finally {
      setBusy(false);
      request.current = null;
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>
            Generate<span className="heading-dot">.</span>
          </h1>
          <p>Preview your next project from a photo of the space.</p>
        </div>
      </div>
      <div className="generate-workspace">
        <form
          className="generate-controls"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Project type
              <select
                value={projectType}
                onChange={(event) => {
                  const next = generationProjectTypes.find(
                    (item) => item.id === event.target.value,
                  )!;
                  setProjectType(next.id);
                  if (!(next.styles as readonly string[]).includes(styleId))
                    setStyleId(next.styles[0]);
                }}
              >
                {generationProjectTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {projectType === "other" && (
              <label>
                What are we working on?
                <input
                  required
                  maxLength={150}
                  value={otherProject}
                  onChange={(event) => setOtherProject(event.target.value)}
                  placeholder="e.g. Laundry room, porch, garage"
                />
              </label>
            )}
            <div className="generate-photo-section">
              <h2>Photo of the space</h2>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-label="Upload project photo"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  void selectPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                className="sr-only"
                tabIndex={-1}
                aria-label="Take project photo"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => {
                  void selectPhoto(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className={`generate-upload ${photo ? "has-photo" : ""}`}
                disabled={preparing}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void selectPhoto(event.dataTransfer.files[0]);
                }}
              >
                {photo ? (
                  <>
                    <img src={photo.url} alt="Your original project photo" />
                    <span>Change photo</span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={28} />
                    <strong>
                      {preparing ? "Preparing photo…" : "Add a project photo"}
                    </strong>
                    <span>Drop a photo here, or browse</span>
                  </>
                )}
              </button>
              <div className="generate-photo-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={preparing}
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera size={16} />
                  Take photo
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={preparing}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} />
                  Upload
                </button>
              </div>
              <p className="generation-note">JPG, PNG or WebP · up to 20 MB</p>
            </div>
            <fieldset className="generate-styles">
              <legend>Choose a style</legend>
              <div className="generate-style-grid">
                {styles.map((style) => (
                  <label
                    key={style.id}
                    className={`generate-style ${styleId === style.id ? "selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="renovation-style"
                      value={style.id}
                      checked={styleId === style.id}
                      onChange={() => setStyleId(style.id)}
                    />
                    <span className="style-swatches" aria-hidden="true">
                      {style.colors.map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                    <strong>
                      {style.name}
                      {styleId === style.id && (
                        <Check size={14} aria-hidden="true" />
                      )}
                    </strong>
                    <span>{style.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Image model
              <select
                value={modelOverride}
                disabled={loading || !config}
                onChange={(event) => setModelOverride(event.target.value)}
              >
                <option value="">
                  Company default
                  {config
                    ? ` — ${config.models.find((item) => item.id === config.defaultModel)?.name || "unavailable"}`
                    : " — loading…"}
                </option>
                {config?.models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {configError && (
              <div className="alert" role="alert">
                {configError}{" "}
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => void refresh()}
                >
                  Retry models
                </button>
              </div>
            )}
            {config && !modelAvailable && (
              <p className="alert">
                The default model is unavailable. Choose another model.
              </p>
            )}
            <label>
              Additional details{" "}
              <span className="optional-label">Optional</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={
                  projectType === "deck"
                    ? "e.g. Composite decking, black railings, room for a dining table"
                    : projectType === "shed"
                      ? "e.g. Garden tool storage, green siding, double doors"
                      : "e.g. Light oak finishes, more storage, warm lighting"
                }
              />
            </label>
            <button
              className="button primary generate-submit"
              disabled={
                busy ||
                preparing ||
                !photo ||
                !modelAvailable ||
                (!demo && !config?.configured)
              }
            >
              {busy ? (
                <LoaderCircle size={18} className="generate-spinner" />
              ) : (
                <WandSparkles size={18} />
              )}
              {busy
                ? "Generating preview…"
                : result
                  ? "Generate another version"
                  : "Generate preview"}
            </button>
          </fieldset>
          <p className="generation-note">
            {demo
              ? "Sign in to generate images in your company workspace."
              : config && !config.configured
                ? "OpenRouter is not connected yet."
                : "Uses company OpenRouter credits. Your photo is sent to the selected image provider when you generate."}
          </p>
          {error && (
            <div ref={errorMessage} className="alert" role="alert">
              {error}
            </div>
          )}
        </form>
        <div
          ref={previewPanel}
          className="generate-preview-panel"
          aria-busy={busy}
        >
          <div className="generate-preview-heading">
            <div>
              <h2>{result ? result.label : "Renovation preview"}</h2>
              <p>
                {result
                  ? result.model
                  : "Compare the original space with your generated concept."}
              </p>
            </div>
            {result && (
              <a
                href={result.url}
                download={result.fileName}
                className="button secondary"
              >
                <Download size={16} />
                Download
              </a>
            )}
          </div>
          {result && (
            <div
              className="generation-view-controls"
              role="group"
              aria-label="Preview layout"
            >
              <button
                type="button"
                aria-pressed={comparisonView === "drag"}
                onClick={() => setComparisonView("drag")}
              >
                <ArrowLeftRight size={15} />
                Drag comparison
              </button>
              <button
                type="button"
                aria-pressed={comparisonView === "stacked"}
                onClick={() => setComparisonView("stacked")}
              >
                Stacked
              </button>
            </div>
          )}
          <div
            ref={comparisonCanvas}
            className={`generate-canvas ${result ? "has-result" : ""} ${
              result && comparisonView === "drag"
                ? "is-comparison"
                : result
                  ? "is-stacked"
                  : ""
            }`}
            onPointerDown={startComparisonDrag}
            onPointerMove={moveComparisonDivider}
            onPointerUp={stopComparisonDrag}
            onPointerCancel={stopComparisonDrag}
            onLostPointerCapture={() => {
              activeComparisonPointer.current = null;
            }}
          >
            {result && photo ? (
              comparisonView === "drag" ? (
                <>
                  <img
                    className="generation-image"
                    src={result.url}
                    alt={`Generated ${result.label} concept`}
                  />
                  <img
                    className="generation-image generation-before"
                    src={photo.url}
                    alt="Original space for comparison"
                    style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                  />
                  <button
                    type="button"
                    className="generation-divider"
                    role="slider"
                    aria-label="Before and after comparison divider"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(split)}
                    aria-valuetext={`${Math.round(split)}% original`}
                    style={{ left: `${split}%` }}
                    onKeyDown={moveComparisonWithKeyboard}
                  >
                    <ArrowLeftRight size={18} />
                  </button>
                  <span className="generation-image-label before">
                    Original
                  </span>
                  <span className="generation-image-label after">
                    Renovated concept
                  </span>
                  <span className="sr-only">
                    Drag the divider across the image, or use the arrow keys
                    when the divider is focused.
                  </span>
                </>
              ) : (
                <>
                  <div className="generation-stack-frame">
                    <img
                      className="generation-image"
                      src={result.url}
                      alt={`Generated ${result.label} concept`}
                    />
                    <span className="generation-image-label after">
                      Renovated concept
                    </span>
                  </div>
                  <div className="generation-stack-frame">
                    <img
                      className="generation-image"
                      src={photo.url}
                      alt="Original space"
                    />
                    <span className="generation-image-label before">
                      Original
                    </span>
                  </div>
                </>
              )
            ) : (
              <div className="generation-empty">
                <WandSparkles size={36} />
                <h3>{photo ? "Photo ready" : "Add a project photo"}</h3>
                <p>
                  {photo
                    ? "Choose your project type and style, then generate a preview."
                    : "Add a photo of a room, deck, shed or outdoor area to see a renovation concept here."}
                </p>
              </div>
            )}
            {busy && (
              <div className="generation-progress" role="status">
                <LoaderCircle size={32} className="generate-spinner" />
                <strong>Creating your renovation preview</strong>
                <span>
                  This can take a few minutes. You can visit another tab in the
                  app while it runs.
                </span>
              </div>
            )}
          </div>
          <p className="generation-note">
            AI design concept. Final dimensions, materials and construction
            details need to be confirmed. Download previews you want to keep.
          </p>
        </div>
      </div>
    </>
  );
}
