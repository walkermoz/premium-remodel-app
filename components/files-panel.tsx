"use client";
import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  ImageIcon,
  LoaderCircle,
  Check,
} from "lucide-react";
import type { Attachment } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { Modal } from "./ui";
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  checkFileSelection,
} from "@/lib/file-policy";
export default function FilesPanel({
  files,
  onUpload,
  onDelete,
  coverId,
  onSetCover,
  admin,
  demo,
}: {
  files: Attachment[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (file: Attachment) => void;
  coverId?: string;
  onSetCover?: (file: Attachment) => Promise<void>;
  admin: boolean;
  demo: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [drag, setDrag] = useState(false);
  const [coverBusy, setCoverBusy] = useState("");
  const url = (f: Attachment) =>
    demo ? f.path : `/api/files?id=${encodeURIComponent(f.id)}`;
  async function upload(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        checkFileSelection(file);
        await onUpload(file);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function setCover(file: Attachment) {
    if (!onSetCover || coverBusy) return;
    setCoverBusy(file.id);
    setError("");
    try {
      await onSetCover(file);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the cover photo.",
      );
    } finally {
      setCoverBusy("");
    }
  }
  return (
    <div className="files-panel">
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <button
        disabled={busy}
        className={`upload-area ${drag ? "dragging" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <span className="upload-icon">
          {busy ? (
            <LoaderCircle size={24} className="spin" />
          ) : (
            <Upload size={24} />
          )}
        </span>
        <strong>
          {busy
            ? "Uploading your files…"
            : "Drop your job photos and files here"}
        </strong>
        <span>
          or <u>browse files</u>
        </span>
        <small>{FILE_TYPES_LABEL} · up to 4 MB each</small>
      </button>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="file-grid">
        {files.map((file) => (
          <div className="file-item" key={file.id}>
            <button
              className="file-preview"
              onClick={() => {
                if (file.mime.startsWith("image/")) setPreview(file);
                else {
                  const a = document.createElement("a");
                  a.href = demo ? file.path : `${url(file)}&download=1`;
                  a.download = file.name;
                  a.click();
                }
              }}
            >
              {file.mime.startsWith("image/") ? (
                <img src={url(file)} alt={file.name} />
              ) : (
                <div className="file-type">
                  <FileText size={38} />
                  <span>{file.name.split(".").pop()?.toUpperCase()}</span>
                </div>
              )}
            </button>
            <div className="file-meta">
              <strong title={file.name}>{file.name}</strong>
              <span>
                {(file.size / 1024).toFixed(0)} KB · {dateLabel(file.createdAt)}
              </span>
              <small>Added by {file.authorName}</small>
              {coverId === file.id && (
                <small className="file-cover-label">
                  <Check size={11} /> Project cover
                </small>
              )}
              <div className="file-actions">
                <a
                  href={demo ? file.path : `${url(file)}&download=1`}
                  download={file.name}
                  className="text-button"
                >
                  <Download size={13} />
                  Download
                </a>
                {file.mime.startsWith("image/") && onSetCover && (
                  <button
                    type="button"
                    className={`text-button file-cover-action ${coverId === file.id ? "is-cover" : ""}`}
                    disabled={!!coverBusy || coverId === file.id}
                    onClick={() => void setCover(file)}
                  >
                    <ImageIcon size={13} />
                    {coverBusy === file.id
                      ? "Setting…"
                      : coverId === file.id
                        ? "Cover"
                        : "Set cover"}
                  </button>
                )}
                {admin && (
                  <button
                    className="icon-button delete-action"
                    onClick={() => onDelete(file)}
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {!files.length && (
        <div className="file-empty">
          <ImageIcon size={18} />
          Progress photos, plans, and documents will appear here.
        </div>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          <img
            className="lightbox-image"
            src={url(preview)}
            alt={preview.name}
          />
        </Modal>
      )}
    </div>
  );
}
