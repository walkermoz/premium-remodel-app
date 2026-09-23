"use client";
import { useRef, useState } from "react";
import { Send, Trash2, MessageSquare, Paperclip, X } from "lucide-react";
import type { Attachment, Comment, User } from "@/lib/types";
import { Avatar } from "./ui";
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  checkFileSelection,
} from "@/lib/file-policy";
import NoteAttachments from "./note-attachments";
export default function ProjectNotes({
  comments,
  files,
  demo,
  user,
  onPost,
  onUpload,
  onDelete,
}: {
  comments: Comment[];
  files: Attachment[];
  demo: boolean;
  user: User;
  onPost: (
    body: string,
    attachmentIds: string[],
    requestId: string,
  ) => Promise<void>;
  onUpload: (file: File) => Promise<Attachment>;
  onDelete: (comment: Comment) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const uploaded = useRef(new Map<File, Attachment>());
  const requestId = useRef(crypto.randomUUID());
  const submittedPayload = useRef("");
  const submitting = useRef(false);
  function selectFiles(list: FileList | null) {
    if (!list || busy) return;
    const next = Array.from(list);
    if (selected.length + next.length > 3) {
      setError("Attach up to three files to a note.");
      return;
    }
    try {
      next.forEach(checkFileSelection);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unsupported file.");
      return;
    }
    setError("");
    setSelected([...selected, ...next]);
  }
  return (
    <section className="activity-panel" aria-label="Job notes">
      <div className="section-heading">
        <div>
          <h2>
            Notes <span className="count-pill">{comments.length}</span>
          </h2>
          <p>Job details, client preferences, and reminders for your team.</p>
        </div>
      </div>
      <form
        className="comment-compose"
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitting.current || (!body.trim() && !selected.length)) return;
          submitting.current = true;
          setBusy(true);
          setError("");
          try {
            const ids: string[] = [];
            for (const file of selected) {
              let attachment = uploaded.current.get(file);
              if (!attachment) {
                attachment = await onUpload(file);
                uploaded.current.set(file, attachment);
              }
              ids.push(attachment.id);
            }
            const payload = JSON.stringify([body.trim(), ids]);
            if (
              submittedPayload.current &&
              submittedPayload.current !== payload
            )
              requestId.current = crypto.randomUUID();
            submittedPayload.current = payload;
            await onPost(body.trim(), ids, requestId.current);
            setBody("");
            setSelected([]);
            uploaded.current.clear();
            requestId.current = crypto.randomUUID();
            submittedPayload.current = "";
          } catch (err) {
            setError(
              `${err instanceof Error ? err.message : "Could not save note. Please try again."}${uploaded.current.size ? " Uploaded files are already in Photos & files. Retry to finish saving the note." : ""}`,
            );
          } finally {
            setBusy(false);
            submitting.current = false;
          }
        }}
      >
        <Avatar name={user.name} />
        <div>
          <textarea
            aria-label="New job note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add job details or something the team should know…"
            rows={4}
            disabled={busy}
            maxLength={15000}
            required={!selected.length}
          />
          <div className="note-compose-attachments">
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept={FILE_ACCEPT}
              aria-label="Note attachments"
              disabled={busy}
              onChange={(event) => {
                selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="button secondary small-button"
              disabled={busy || selected.length >= 3}
              onClick={() => input.current?.click()}
            >
              <Paperclip size={15} />
              Attach photo or file
            </button>
            <p className="note-file-help">
              {FILE_TYPES_LABEL} · up to 3 files, 4 MB each. Also saved in
              Photos & files.
            </p>
            {selected.map((file, index) => (
              <div className="activity-selected-file" key={index}>
                <Paperclip size={14} />
                <span>{file.name}</span>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => {
                    setSelected(selected.filter((_, i) => i !== index));
                    setError(
                      uploaded.current.has(file)
                        ? "The uploaded file remains in Photos & files."
                        : "",
                    );
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="compose-footer">
            <span>Shared with your team</span>
            <button
              className="button primary"
              disabled={busy || (!body.trim() && !selected.length)}
            >
              {busy ? "Saving…" : "Add note"}
              <Send size={14} />
            </button>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </div>
      </form>
      <div className="activity-feed">
        {[...comments]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((c) => (
            <article className="activity-item" key={c.id}>
              <Avatar name={c.authorName} />
              <div>
                <header>
                  <strong>{c.authorName}</strong>
                  <time dateTime={c.createdAt}>
                    {new Date(c.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  {(user.role === "admin" || user.id === c.authorId) && (
                    <button
                      className="icon-button delete-action"
                      onClick={() => onDelete(c)}
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </header>
                {!!c.body && <p>{c.body}</p>}
                {!!c.attachmentIds?.length && (
                  <NoteAttachments
                    ids={c.attachmentIds}
                    files={files}
                    demo={demo}
                  />
                )}
              </div>
            </article>
          ))}
      </div>
      {!comments.length && (
        <div className="file-empty">
          <MessageSquare size={17} />
          No notes yet. Add the first note for this job.
        </div>
      )}
    </section>
  );
}
