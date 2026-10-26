"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ImagePlus,
  LoaderCircle,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type { Attachment, Quote, QuotePhoto } from "@/lib/types";
import { generationProjectTypes, stylesForProject } from "@/lib/generation";
import { prepareGenerationFile } from "@/lib/generation-client";
import { useGenerationConfig } from "./use-generation-config";

const roles: { value: QuotePhoto["kind"]; label: string }[] = [
  { value: "before", label: "Before photo" },
  { value: "example", label: "Example photo" },
  { value: "concept", label: "AI concept" },
];

export default function QuotePhotosPanel({
  quote,
  files,
  demo,
  onSave,
  onUpload,
  onDelete,
  admin,
}: {
  quote: Quote;
  files: Attachment[];
  demo: boolean;
  onSave: (photos: QuotePhoto[]) => Promise<unknown>;
  onUpload: (file: File) => Promise<Attachment>;
  onDelete: (file: Attachment) => void;
  admin: boolean;
}) {
  const images = files.filter((file) =>
    ["image/jpeg", "image/png", "image/webp"].includes(file.mime),
  );
  const [rolesById, setRolesById] = useState<
    Record<string, QuotePhoto["kind"]>
  >({});
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [sourceId, setSourceId] = useState("");
  const [projectType, setProjectType] = useState("bathroom");
  const [style, setStyle] = useState("modern");
  const [otherProject, setOtherProject] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const { config, error: configError } = useGenerationConfig(
    demo,
    !!images.length,
  );
  const selectedSource =
    images.find((file) => file.id === sourceId) || images[0];
  const styles = stylesForProject(projectType);
  const selectedModel =
    config?.models.find((item) => item.id === config.defaultModel)?.id ||
    config?.models[0]?.id;
  const included = quote.quotePhotos || [];

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  function photoUrl(file: Attachment) {
    return demo ? file.path : `/api/files?id=${encodeURIComponent(file.id)}`;
  }

  async function updatePhotos(next: QuotePhoto[]) {
    setBusy("saving");
    setError("");
    try {
      await onSave(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save quote photos.",
      );
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    if (!selectedSource || busy) return;
    if (demo) {
      setError("Sign in to generate a finished concept for this quote.");
      return;
    }
    if (!selectedModel) {
      setError(configError || "No image model is available right now.");
      return;
    }
    if (projectType === "other" && !otherProject.trim()) {
      setError("Describe the project type first.");
      return;
    }
    setBusy("generating");
    setError("");
    setResult(null);
    try {
      const source = await fetch(photoUrl(selectedSource), {
        cache: "no-store",
      });
      if (!source.ok) throw new Error("Could not open the before photo.");
      const input = new File([await source.blob()], selectedSource.name, {
        type: selectedSource.mime,
      });
      const photo = await prepareGenerationFile(input);
      const form = new FormData();
      form.set("photo", photo);
      form.set("projectType", projectType);
      form.set("otherProject", otherProject);
      form.set("style", style);
      form.set("model", selectedModel);
      form.set("notes", notes);
      const response = await fetch("/api/generate", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(270000),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Could not create the concept.");
      }
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error("The image service returned no usable photo.");
      const blob = await response.blob();
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the concept.",
      );
    } finally {
      setBusy("");
    }
  }

  async function addConcept() {
    if (!result || busy) return;
    if (included.length >= 8) {
      setError("A quote can include up to 8 photos. Remove one first.");
      return;
    }
    setBusy("uploading");
    setError("");
    try {
      const file = new File([result.blob], "finished-concept.jpg", {
        type: "image/jpeg",
      });
      const attachment = await onUpload(file);
      await onSave([
        ...included,
        {
          attachmentId: attachment.id,
          kind: "concept",
          caption: `${generationProjectTypes.find((item) => item.id === projectType)?.name || "Project"} - ${styles.find((item) => item.id === style)?.name || "finished concept"}`,
        },
      ]);
      setResult(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the concept to this quote.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="quote-photos-panel">
      {!!images.length && (
        <div className="quote-photos-gallery">
          <div className="quote-photos-heading">
            <strong>Photos for the customer quote</strong>
            <span>{included.length} of 8 selected</span>
          </div>
          <div className="quote-photos-grid">
            {images.map((file) => {
              const selected = included.find(
                (photo) => photo.attachmentId === file.id,
              );
              const kind = rolesById[file.id] || selected?.kind || "before";
              return (
                <div className="quote-photo-item" key={file.id}>
                  <img src={photoUrl(file)} alt={file.name} />
                  <div className="quote-photo-item-body">
                    <strong title={file.name}>{file.name}</strong>
                    <select
                      aria-label={`Photo type for ${file.name}`}
                      value={kind}
                      disabled={!!busy}
                      onChange={(event) => {
                        const nextKind = event.target
                          .value as QuotePhoto["kind"];
                        setRolesById((current) => ({
                          ...current,
                          [file.id]: nextKind,
                        }));
                        if (selected)
                          void updatePhotos(
                            included.map((photo) =>
                              photo.attachmentId === file.id
                                ? { ...photo, kind: nextKind }
                                : photo,
                            ),
                          );
                      }}
                    >
                      {roles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    {selected && (
                      <div className="quote-photo-caption">
                        <input
                          aria-label={`Caption for ${file.name}`}
                          placeholder="Caption (optional)"
                          maxLength={120}
                          value={captions[file.id] ?? selected.caption}
                          disabled={!!busy}
                          onChange={(event) =>
                            setCaptions((current) => ({
                              ...current,
                              [file.id]: event.target.value,
                            }))
                          }
                        />
                        {captions[file.id] !== undefined &&
                          captions[file.id] !== selected.caption && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() =>
                                void updatePhotos(
                                  included.map((photo) =>
                                    photo.attachmentId === file.id
                                      ? { ...photo, caption: captions[file.id] }
                                      : photo,
                                  ),
                                )
                              }
                            >
                              Save caption
                            </button>
                          )}
                      </div>
                    )}
                    <button
                      type="button"
                      className={`button ${selected ? "secondary" : "primary"}`}
                      disabled={!!busy || (!selected && included.length >= 8)}
                      onClick={() =>
                        void updatePhotos(
                          selected
                            ? included.filter(
                                (photo) => photo.attachmentId !== file.id,
                              )
                            : [
                                ...included,
                                { attachmentId: file.id, kind, caption: "" },
                              ],
                        )
                      }
                    >
                      {selected ? "Remove from quote" : "Include in quote"}
                    </button>
                    <div className="quote-photo-file-actions">
                      <a
                        href={demo ? file.path : `${photoUrl(file)}&download=1`}
                        download={file.name}
                      >
                        <Download size={13} /> Download
                      </a>
                      {admin && (
                        <button
                          type="button"
                          aria-label={`Delete ${file.name}`}
                          title={
                            selected
                              ? "Remove this photo from the quote before deleting it."
                              : undefined
                          }
                          disabled={!!busy || !!selected}
                          onClick={() => onDelete(file)}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="quote-concept-builder">
        <div className="quote-photos-heading">
          <div>
            <strong>Show the finished space</strong>
            <p>
              Generate a visual concept from a before photo. Review it before
              adding it to the quote.
            </p>
          </div>
          <WandSparkles size={19} aria-hidden="true" />
        </div>
        {images.length ? (
          <div className="quote-concept-form">
            <label>
              Before photo
              <select
                value={selectedSource?.id}
                disabled={!!busy}
                onChange={(event) => setSourceId(event.target.value)}
              >
                {images.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project type
              <select
                value={projectType}
                disabled={!!busy}
                onChange={(event) => {
                  const next = generationProjectTypes.find(
                    (item) => item.id === event.target.value,
                  )!;
                  setProjectType(next.id);
                  if (!(next.styles as readonly string[]).includes(style))
                    setStyle(next.styles[0]);
                }}
              >
                {generationProjectTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Style
              <select
                value={style}
                disabled={!!busy}
                onChange={(event) => setStyle(event.target.value)}
              >
                {styles.map((item) => (
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
                  value={otherProject}
                  maxLength={150}
                  disabled={!!busy}
                  onChange={(event) => setOtherProject(event.target.value)}
                />
              </label>
            )}
            <label className="quote-concept-notes">
              Finish details (optional)
              <input
                value={notes}
                maxLength={1000}
                disabled={!!busy}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. oak vanity, light stone, brass fixtures"
              />
            </label>
            <button
              type="button"
              className="button primary"
              disabled={!!busy || demo || !selectedModel}
              onClick={() => void generate()}
            >
              {busy === "generating" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <WandSparkles size={16} />
              )}
              {busy === "generating"
                ? "Generating…"
                : "Generate finished concept"}
            </button>
          </div>
        ) : (
          <p className="quote-concept-empty">
            <ImagePlus size={17} /> Upload a before photo below to create a
            concept.
          </p>
        )}
        {demo && !!images.length && (
          <p className="quote-concept-note">
            Sign in to generate images in your company workspace.
          </p>
        )}
        {!demo && !!images.length && configError && (
          <p className="quote-concept-note">{configError}</p>
        )}
        {result && (
          <div className="quote-concept-result">
            <img src={result.url} alt="Generated finished concept" />
            <div>
              <strong>Finished concept</strong>
              <p>
                Review this image before including it. AI concepts are
                illustrative; the quote scope defines the work.
              </p>
              <button
                type="button"
                className="button primary"
                disabled={!!busy || included.length >= 8}
                onClick={() => void addConcept()}
              >
                {busy === "uploading" ? "Adding…" : "Add concept to quote"}
              </button>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
