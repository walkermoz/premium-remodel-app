"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function DocumentPreparationDialog({
  prepared,
  onClose,
  children,
}: {
  prepared: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const close = () => {
    // Close while still mounted so the browser restores focus to its opener.
    ref.current?.close();
    onClose();
  };
  return (
    <dialog
      ref={ref}
      className="document-preparation-dialog"
      aria-labelledby="document-preparation-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id="document-preparation-title">
            {prepared ? "Agreement details" : "Prepare service agreement"}
          </h2>
          <p>
            {prepared
              ? "Review the saved agreement and company signature."
              : "Confirm the details, then review and add your company signature."}
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={close}
          aria-label="Close agreement preparation"
        >
          <X size={17} aria-hidden="true" /> Close
        </button>
      </header>
      <div className="document-preparation-body">{children}</div>
    </dialog>
  );
}
