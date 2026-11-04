"use client";

import {
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  blogLengthOptions,
  blogToneOptions,
  demoBlogDraft,
  naturalizeBlogText,
  type BlogBrief,
  type BlogDraft,
} from "@/lib/blog-generation";
import { connectionIsReady } from "@/lib/organization-connections.types";
import ConnectionRequirement from "./connection-requirement";
import { useOrganizationConnection } from "./use-organization-connections";

function articleBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {list.map((item, index) => (
          <li key={`${item}-${index}`}>{item.replace(/\*\*/g, "")}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line) continue;
    if (line.startsWith("### "))
      blocks.push(<h3 key={`h3-${blocks.length}`}>{line.slice(4)}</h3>);
    else if (line.startsWith("## "))
      blocks.push(<h2 key={`h2-${blocks.length}`}>{line.slice(3)}</h2>);
    else
      blocks.push(
        <p key={`p-${blocks.length}`}>{line.replace(/\*\*/g, "")}</p>,
      );
  }
  flushList();
  return blocks;
}

function blogMarkdown(draft: BlogDraft) {
  return `# ${naturalizeBlogText(draft.title)}\n\n${naturalizeBlogText(draft.bodyMarkdown)}\n`;
}

export default function MediaPanel({
  demo,
  businessName,
  website,
  serviceArea,
}: {
  demo: boolean;
  businessName: string;
  website: string;
  serviceArea: string;
}) {
  const { capability: aiCapability, loading: connectionLoading } =
    useOrganizationConnection("openrouter_generation", demo);
  const aiReady = connectionIsReady(aiCapability);
  const defaultAudience = serviceArea
    ? `Homeowners in ${serviceArea}`
    : "Homeowners planning a remodel";
  const [brief, setBrief] = useState<BlogBrief>({
    topic: "",
    audience: defaultAudience,
    angle: "",
    keywords: "",
    tone: "practical",
    length: "standard",
  });
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const preview = useMemo(
    () => (draft ? articleBlocks(draft.bodyMarkdown) : []),
    [draft],
  );

  function updateBrief<Key extends keyof BlogBrief>(
    key: Key,
    value: BlogBrief[Key],
  ) {
    setBrief((current) => ({ ...current, [key]: value }));
  }

  function updateDraft(patch: Partial<BlogDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setCopied(false);
  }

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || brief.topic.trim().length < 5) return;
    if (!aiReady) {
      setError(
        aiCapability?.detail ||
          "Connect AI tools in Settings before generating a blog.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      if (demo) {
        setDraft(demoBlogDraft(brief.topic, businessName));
        setGeneratedAt(new Date().toISOString());
        setMode("preview");
        return;
      }
      const response = await fetch("/api/media/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not generate the blog draft.");
      setDraft(body.draft);
      setGeneratedAt(body.generatedAt);
      setMode("preview");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not generate the blog draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(blogMarkdown(draft));
      setCopied(true);
    } catch {
      setError(
        "Copying was blocked. Select the article text and copy it manually.",
      );
    }
  }

  function downloadDraft() {
    if (!draft) return;
    const blob = new Blob([blogMarkdown(draft)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.slug || "blog-draft"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="media-page">
      <header className="page-heading media-heading">
        <div>
          <span className="eyebrow">CONTENT WORKSPACE</span>
          <h1>
            Media<span className="heading-dot">.</span>
          </h1>
          <p>Create useful, on-brand content from a clear topic and brief.</p>
        </div>
      </header>

      <div className="media-studio">
        <form
          className="media-brief"
          onSubmit={(event) => void generate(event)}
        >
          <div className="media-brief-heading">
            <span>BLOG BRIEF</span>
            <h2>What should this article cover?</h2>
            <p>
              The draft uses {businessName}&apos;s business profile and removes
              em dashes automatically.
            </p>
          </div>
          <label>
            Topic
            <textarea
              value={brief.topic}
              onChange={(event) => updateBrief("topic", event.target.value)}
              placeholder="e.g. What to expect during a kitchen remodel"
              rows={4}
              minLength={5}
              maxLength={240}
              required
              disabled={busy}
            />
          </label>
          <label>
            Audience
            <input
              value={brief.audience}
              onChange={(event) => updateBrief("audience", event.target.value)}
              maxLength={200}
              disabled={busy}
            />
          </label>
          <label>
            Point of view <span>Optional</span>
            <textarea
              value={brief.angle}
              onChange={(event) => updateBrief("angle", event.target.value)}
              placeholder="A specific question, opinion, or takeaway to emphasize"
              rows={3}
              maxLength={500}
              disabled={busy}
            />
          </label>
          <label>
            Search phrases <span>Optional</span>
            <input
              value={brief.keywords}
              onChange={(event) => updateBrief("keywords", event.target.value)}
              placeholder="kitchen remodel, project timeline"
              maxLength={300}
              disabled={busy}
            />
          </label>
          <div className="media-brief-pair">
            <label>
              Voice
              <select
                value={brief.tone}
                onChange={(event) =>
                  updateBrief("tone", event.target.value as BlogBrief["tone"])
                }
                disabled={busy}
              >
                {blogToneOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Length
              <select
                value={brief.length}
                onChange={(event) =>
                  updateBrief(
                    "length",
                    event.target.value as BlogBrief["length"],
                  )
                }
                disabled={busy}
              >
                {blogLengthOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} · about {option.words.toLocaleString()} words
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="media-natural-voice">
            <Check size={15} aria-hidden="true" />
            <span>
              Natural voice applied
              <small>
                Varied sentences, concrete language, no canned AI phrases, and
                no em dashes.
              </small>
            </span>
          </div>
          <ConnectionRequirement
            capability={aiCapability}
            loading={connectionLoading}
            compact
          />
          <button
            className="button primary media-generate"
            disabled={
              busy ||
              connectionLoading ||
              !aiReady ||
              brief.topic.trim().length < 5
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Sparkles size={17} />
            )}
            {busy
              ? "Writing draft…"
              : draft
                ? "Generate a new draft"
                : "Generate blog"}
          </button>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </form>

        <div className={`media-draft${draft ? " has-draft" : " is-empty"}`}>
          {!draft ? (
            <div className="media-empty-state">
              <FileText size={30} aria-hidden="true" />
              <span>DRAFT</span>
              <h2>Your article will appear here</h2>
              <p>
                Start with a useful topic. The result includes an editable
                article, excerpt, URL slug, search phrases, and meta
                description.
              </p>
            </div>
          ) : (
            <>
              <div className="media-draft-toolbar">
                <div>
                  <span>DRAFT</span>
                  <small>
                    {generatedAt
                      ? `Generated ${new Date(generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Ready to review"}
                  </small>
                </div>
                <div className="media-draft-actions">
                  <button
                    type="button"
                    className={mode === "preview" ? "is-active" : ""}
                    onClick={() => setMode("preview")}
                  >
                    <Eye size={15} /> Preview
                  </button>
                  <button
                    type="button"
                    className={mode === "edit" ? "is-active" : ""}
                    onClick={() => setMode("edit")}
                  >
                    <PenLine size={15} /> Edit
                  </button>
                  <button type="button" onClick={() => void copyDraft()}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button type="button" onClick={downloadDraft}>
                    <Download size={15} /> Download
                  </button>
                </div>
              </div>

              {mode === "preview" ? (
                <article className="media-article-preview">
                  <span>{businessName}</span>
                  <h1>{draft.title}</h1>
                  <p className="media-article-excerpt">{draft.excerpt}</p>
                  <div className="media-article-body">{preview}</div>
                  {(website || businessName) && (
                    <footer>
                      <strong>{businessName}</strong>
                      {website && (
                        <span>{website.replace(/^https?:\/\//, "")}</span>
                      )}
                    </footer>
                  )}
                </article>
              ) : (
                <div className="media-draft-editor">
                  <label>
                    Title
                    <input
                      value={draft.title}
                      maxLength={140}
                      onChange={(event) =>
                        updateDraft({ title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    URL slug
                    <input
                      value={draft.slug}
                      maxLength={160}
                      onChange={(event) =>
                        updateDraft({ slug: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Excerpt
                    <textarea
                      value={draft.excerpt}
                      rows={3}
                      maxLength={320}
                      onChange={(event) =>
                        updateDraft({ excerpt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Meta description
                    <textarea
                      value={draft.metaDescription}
                      rows={3}
                      maxLength={180}
                      onChange={(event) =>
                        updateDraft({ metaDescription: event.target.value })
                      }
                    />
                    <small>{draft.metaDescription.length} / 180</small>
                  </label>
                  <label>
                    Search phrases
                    <input
                      value={draft.keywords.join(", ")}
                      onChange={(event) =>
                        updateDraft({
                          keywords: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean)
                            .slice(0, 10),
                        })
                      }
                    />
                  </label>
                  <label>
                    Article
                    <textarea
                      className="media-body-editor"
                      value={draft.bodyMarkdown}
                      onChange={(event) =>
                        updateDraft({ bodyMarkdown: event.target.value })
                      }
                      rows={34}
                    />
                  </label>
                </div>
              )}

              <aside className="media-seo-strip" aria-label="Blog metadata">
                <div>
                  <span>URL</span>
                  <strong>/{draft.slug}</strong>
                </div>
                <div>
                  <span>META DESCRIPTION</span>
                  <p>{draft.metaDescription}</p>
                </div>
                <div>
                  <span>SEARCH PHRASES</span>
                  <p>{draft.keywords.join(" · ")}</p>
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
