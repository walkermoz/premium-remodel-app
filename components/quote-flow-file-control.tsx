"use client";

import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  checkFileSelection,
} from "@/lib/file-policy";
import styles from "./quote-flow-file-control.module.css";

export type FlowFileValue = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export default function QuoteFlowFileControl({
  value,
  busy,
  onUpload,
}: {
  value: unknown;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const saved =
    value && typeof value === "object"
      ? (value as Partial<FlowFileValue>)
      : null;

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setError("");
    try {
      checkFileSelection(file);
      await onUpload(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={styles.control}>
      <input
        ref={input}
        type="file"
        hidden
        accept={FILE_ACCEPT}
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {saved?.id ? (
        <div className={styles.saved}>
          <Check size={15} />
          <span>
            <strong>{saved.name}</strong>
            <small>{Math.ceil(Number(saved.size || 0) / 1024)} KB</small>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.upload}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          <span>
            <strong>{busy ? "Uploading…" : "Choose file"}</strong>
            <small>{FILE_TYPES_LABEL} · up to 4 MB</small>
          </span>
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
