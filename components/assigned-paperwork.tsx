"use client";
import { useEffect, useState } from "react";
export default function AssignedPaperwork({ demo }: { demo: boolean }) {
  const [documents, setDocuments] = useState<
    Array<{ id: string; title: string; quoteName: string }>
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (demo) return;
    let active = true;
    void fetch("/api/paperwork?assigned=me", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok && active)
          setDocuments((await response.json()).documents || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [demo]);
  if (!documents.length) return null;
  return (
    <section className="content-section" aria-label="My paperwork">
      <h2>Paperwork assigned to you</h2>
      {error && <p role="alert">{error}</p>}
      {documents.map((document) => (
        <article className="paperwork-row" key={document.id}>
          <div className="paperwork-heading">
            <div>
              <h3>{document.title}</h3>
              <p>{document.quoteName}</p>
            </div>
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy(document.id);
                setError("");
                try {
                  const response = await fetch(
                    `/api/paperwork/${document.id}/assigned`,
                    { method: "POST" },
                  );
                  const body = await response.json();
                  if (!response.ok)
                    throw Error(body.error || "Could not open your paperwork.");
                  window.location.assign(body.url);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not open paperwork.",
                  );
                  setBusy("");
                }
              }}
            >
              {busy === document.id ? "Opening…" : "Review & complete"}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
