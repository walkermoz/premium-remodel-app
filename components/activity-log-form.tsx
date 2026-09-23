"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import {
  activityTypes,
  type Attachment,
  type User,
  type Workspace,
} from "@/lib/types";
import {
  demoActivityMembers,
  isPayment,
  localDateTime,
  paymentMethods,
} from "@/lib/activity";
import { schemas } from "@/lib/schemas";
import { Modal } from "./ui";
import {
  FILE_ACCEPT,
  FILE_TYPES_LABEL,
  checkFileSelection,
} from "@/lib/file-policy";

export default function ActivityLogForm({
  workspace,
  user,
  demo,
  projectId: initialProject = "",
  initialType = "General update",
  onClose,
  onUpload,
  onSave,
}: {
  workspace: Workspace;
  user: User;
  demo: boolean;
  projectId?: string;
  initialType?: (typeof activityTypes)[number];
  onClose: () => void;
  onUpload: (file: File, projectId: string) => Promise<Attachment>;
  onSave: (data: Record<string, unknown>, requestId: string) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(initialProject);
  const [type, setType] = useState<(typeof activityTypes)[number]>(initialType);
  const [actorId, setActorId] = useState(user.id);
  const [members, setMembers] = useState<User[]>(
    demo ? demoActivityMembers(user) : [user],
  );
  const [teamError, setTeamError] = useState("");
  const [party, setParty] = useState(
    workspace.projects.find((p) => p.id === initialProject)?.client || "",
  );
  const [contractorId, setContractorId] = useState("");
  const [when, setWhen] = useState(() => localDateTime());
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Check");
  const [files, setFiles] = useState<{ file: File; uploaded?: Attachment }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef(new Map<File, Attachment>());
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/auth", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.members) setMembers(data.members);
        else
          setTeamError(
            "Could not load teammates. You can still log an activity as yourself.",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setTeamError(
            "Could not load teammates. You can still log an activity as yourself.",
          );
      });
    return () => controller.abort();
  }, [demo]);
  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list);
    if (files.length + next.length > 3) {
      setError("Attach up to three files.");
      return;
    }
    try {
      next.forEach(checkFileSelection);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unsupported file.");
      return;
    }
    setError("");
    setFiles([...files, ...next.map((file) => ({ file }))]);
  }
  return (
    <Modal
      title="Log activity"
      subtitle="Record what happened on the job."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setError("");
          const date = new Date(when);
          const parsed = schemas.activity.safeParse({
            projectId,
            activityType: type,
            actorId,
            occurredAt: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
            summary,
            notes,
            amount: isPayment(type) && amount !== "" ? Number(amount) : null,
            party,
            paymentMethod: isPayment(type) ? method : "",
            contractorId: type === "Subcontractor paid" ? contractorId : "",
            attachmentIds: [],
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          setBusy(true);
          setSubmitted(true);
          try {
            const ids: string[] = [];
            for (const item of files) {
              let attachment = uploaded.current.get(item.file);
              if (!attachment) {
                attachment = await onUpload(item.file, projectId);
                uploaded.current.set(item.file, attachment);
              }
              ids.push(attachment.id);
            }
            await onSave(
              { ...parsed.data, attachmentIds: ids },
              requestId.current,
            );
            onClose();
          } catch (err) {
            setError(
              `${err instanceof Error ? err.message : "Activity could not be saved."}${uploaded.current.size ? " Uploaded files are saved in this project's Photos & files. Retry to finish logging the activity." : ""}`,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-fields activity-log-fields">
          <fieldset disabled={busy}>
            <label>
              Project
              <select
                required
                value={projectId}
                disabled={Boolean(initialProject) || submitted}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setParty(
                    workspace.projects.find((p) => p.id === e.target.value)
                      ?.client || "",
                  );
                }}
              >
                <option value="">Choose a project</option>
                {workspace.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Activity type
              <select
                value={type}
                onChange={(e) => {
                  const next = e.target.value as typeof type;
                  setType(next);
                  setContractorId("");
                  setParty(
                    next === "Subcontractor paid"
                      ? ""
                      : workspace.projects.find((p) => p.id === projectId)
                          ?.client || "",
                  );
                }}
              >
                {activityTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Who did it?
                <select
                  value={actorId}
                  onChange={(e) => setActorId(e.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                      {member.id === user.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date and time (local)
                <input
                  type="datetime-local"
                  required
                  value={when}
                  max={localDateTime()}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
            </div>
            {teamError && <p className="muted">{teamError}</p>}
            {type === "Subcontractor paid" && (
              <label>
                Subcontractor
                <select
                  value={contractorId}
                  onChange={(e) => {
                    setContractorId(e.target.value);
                    const contractor = workspace.contractors.find(
                      (c) => c.id === e.target.value,
                    );
                    setParty(contractor?.company || contractor?.name || "");
                  }}
                >
                  <option value="">Enter a name below</option>
                  {workspace.contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company || c.name} · {c.trade}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {type !== "General update" && (
              <label>
                {type === "Payment received"
                  ? "Received from"
                  : type === "Subcontractor paid"
                    ? "Paid to"
                    : "Delivered to (optional)"}
                <input
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                  required={isPayment(type)}
                  maxLength={250}
                  placeholder={
                    type === "Subcontractor paid"
                      ? "Contractor name or company"
                      : "Client or recipient name"
                  }
                />
              </label>
            )}
            {isPayment(type) && (
              <div className="form-grid">
                <label>
                  Amount ($)
                  <input
                    type="number"
                    required
                    min="0.01"
                    max="1000000000"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Payment method
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    {paymentMethods.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <label>
              {type === "General update" ? "Update" : "What was it for?"}
              <input
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={250}
                placeholder={
                  type === "Payment received"
                    ? "e.g. Flooring deposit"
                    : type === "Materials delivered"
                      ? "e.g. Lumber for the garage framing"
                      : type === "Subcontractor paid"
                        ? "e.g. Framing labor"
                        : "e.g. Client approved the tile selection"
                }
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={15000}
                placeholder="Any details the team should know"
              />
            </label>
            <div className="activity-attach">
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept={FILE_ACCEPT}
                aria-label="Activity attachments"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="button secondary"
                disabled={files.length >= 3}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={15} />
                Attach photos or receipts
              </button>
              <p>
                {FILE_TYPES_LABEL}. Up to 3 files · 4 MB each. Saved with this
                activity and in the project’s files.
              </p>
              {files.map((item, index) => (
                <div className="activity-selected-file" key={index}>
                  <Paperclip size={14} />
                  <span>{item.file.name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() =>
                      setFiles(files.filter((_, i) => i !== index))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !workspace.projects.length}
          >
            {busy ? "Saving activity…" : "Log activity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
