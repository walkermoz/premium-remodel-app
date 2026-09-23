"use client";
import { useEffect, useRef, useState } from "react";
import type {
  Entity,
  Project,
  Quote,
  Task,
  Contractor,
  ScopeItem,
  Workspace,
} from "@/lib/types";
import { Modal } from "./ui";
import { LoaderCircle } from "lucide-react";
import ContractorFields from "./contractor-fields";
import AddressInput from "./address-input";
import { workTypes, quoteStatuses, type WorkType } from "@/lib/types";
import { workToday } from "@/lib/work";
export type FormKind = "project" | "quote" | "task" | "contractor" | "scope";
export interface Editor {
  kind: FormKind;
  entity?: Entity;
  projectId?: string;
  dueDate?: string;
  workType?: WorkType;
}
export function EntityForm({
  editor,
  workspace,
  onSave,
  onClose,
}: {
  editor: Editor;
  workspace: Workspace;
  onSave: (
    kind: FormKind,
    data: Record<string, unknown>,
    existing?: Entity,
  ) => Promise<Entity>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { kind, entity } = editor;
  const project = entity as Project | Quote | undefined;
  const [projectStatus, setProjectStatus] = useState<string>(
    project?.status || (kind === "quote" ? "Draft" : "Planning"),
  );
  const task = entity as Task | undefined;
  const [workType, setWorkType] = useState<WorkType>(
    task?.workType || editor.workType || "Task",
  );
  const sub = entity as Contractor | undefined;
  const item = entity as ScopeItem | undefined;
  const [contractorId, setContractorId] = useState(
    entity && "contractorId" in entity ? entity.contractorId : "",
  );
  const [addingContractor, setAddingContractor] = useState(false);
  const [contractorBusy, setContractorBusy] = useState(false);
  const [contractorError, setContractorError] = useState("");
  const contractorForm = useRef<HTMLFormElement>(null);
  const contractorSelect = useRef<HTMLSelectElement>(null);
  const wasAddingContractor = useRef(false);
  useEffect(() => {
    if (addingContractor)
      contractorForm.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (wasAddingContractor.current) contractorSelect.current?.focus();
    wasAddingContractor.current = addingContractor;
  }, [addingContractor]);
  const names = {
    project: "project",
    quote: "quote",
    task: "work",
    contractor: "contractor",
    scope: "scope item",
  };
  const contractor = (label = "Assigned contractor", canCreate = false) => (
    <label>
      {label}
      <select
        ref={contractorSelect}
        name="contractorId"
        value={contractorId}
        onChange={(event) => {
          if (canCreate && event.target.value === "__new_contractor__") {
            setContractorError("");
            setAddingContractor(true);
          } else setContractorId(event.target.value);
        }}
      >
        <option value="">Unassigned</option>
        {canCreate && (
          <option value="__new_contractor__">+ Add new contractor…</option>
        )}
        {workspace.contractors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.trade || c.company}
          </option>
        ))}
      </select>
    </label>
  );
  const projectSelect = (
    <label>
      {kind === "scope" ? "Project or quote" : "Project"}
      <select
        name="projectId"
        defaultValue={
          (entity && "projectId" in entity
            ? entity.projectId
            : editor.projectId) || ""
        }
        required
      >
        <option value="" disabled>
          Choose a project
        </option>
        {[
          ...workspace.projects,
          ...(kind === "scope" ? workspace.quotes || [] : []),
        ].map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || addingContractor) return;
    setBusy(true);
    setError("");
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    for (const key of ["quantity", "estimate", "subCost", "materialCost"])
      if (key in data) data[key] = Number(data[key]);
    try {
      await onSave(kind, data, entity);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
      setBusy(false);
    }
  }
  async function createContractor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (contractorBusy) return;
    setContractorBusy(true);
    setContractorError("");
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const created = await onSave("contractor", data);
      setContractorId(created.id);
      setAddingContractor(false);
    } catch (error) {
      setContractorError(
        error instanceof Error
          ? error.message
          : "Could not save this contractor. Please try again.",
      );
    } finally {
      setContractorBusy(false);
    }
  }
  return (
    <Modal
      title={
        addingContractor
          ? "New contractor"
          : `${entity ? "Edit" : "New"} ${names[kind]}`
      }
      subtitle={
        addingContractor
          ? "Save their contact details, then return to your work."
          : kind === "scope"
            ? "Enter totals for this item. Quantity is shown separately."
            : "Keep the details your team needs in one place."
      }
      onClose={() => {
        if (busy || contractorBusy) return;
        if (addingContractor) setAddingContractor(false);
        else onClose();
      }}
    >
      <form
        className="entity-form"
        onSubmit={submit}
        hidden={addingContractor}
        inert={addingContractor}
      >
        <div className="form-fields">
          {(kind === "project" || kind === "quote") && (
            <>
              <label>
                {kind === "quote" ? "Quote name" : "Project name"}
                <input
                  name="name"
                  defaultValue={project?.name}
                  placeholder="e.g. Oakwood kitchen remodel"
                  required
                  maxLength={250}
                />
              </label>
              <div className="form-grid">
                <label>
                  Client name
                  <input
                    name="client"
                    defaultValue={project?.client}
                    placeholder="Client or family name"
                    maxLength={250}
                  />
                </label>
                <label>
                  Project type
                  <select
                    name="category"
                    defaultValue={project?.category || "Kitchen"}
                  >
                    {[
                      "Kitchen",
                      "Bathroom",
                      "Basement",
                      "Outdoor",
                      "Whole home",
                      "Other",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Client email
                  <input
                    name="clientEmail"
                    type="email"
                    maxLength={250}
                    defaultValue={project?.clientEmail}
                  />
                </label>
                <label>
                  Client phone
                  <input
                    name="clientPhone"
                    type="tel"
                    maxLength={250}
                    defaultValue={project?.clientPhone}
                  />
                </label>
              </div>
              <AddressInput defaultValue={project?.address} />
              <p className="project-date-help">
                The price comes from the scope of work. Add priced scope items
                after saving.
              </p>
              {kind === "quote" && (
                <label>
                  Linked lead
                  <select
                    name="leadId"
                    defaultValue={(project as Quote | undefined)?.leadId || ""}
                    required={!entity}
                  >
                    <option value="">
                      {entity ? "No linked lead" : "Choose a lead"}
                    </option>
                    {workspace.leads
                      .slice()
                      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
                      .map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name} · {lead.project} · {lead.status}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Status
                <select
                  name="status"
                  value={projectStatus}
                  onChange={(event) => setProjectStatus(event.target.value)}
                >
                  {(kind === "quote"
                    ? quoteStatuses
                    : ["Planning", "In progress", "On hold", "Completed"]
                  ).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Start date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={project?.startDate}
                  />
                </label>
                <label>
                  Target completion
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={project?.endDate}
                  />
                </label>
              </div>
              {kind === "project" && (
                <p className="project-date-help">
                  Days on contract count from the start date, with the first day
                  as day 1. Starting a project with no start date uses today.
                </p>
              )}
              {projectStatus === "Completed" && (
                <label>
                  Actual completion date
                  <input
                    name="completedDate"
                    type="date"
                    max={workToday()}
                    defaultValue={
                      project?.completedDate ||
                      (project?.status === "Completed" ? "" : workToday())
                    }
                  />
                </label>
              )}
              <label>
                Full scope of work
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={project?.description}
                  placeholder="Describe the work, materials, and details for this project."
                  maxLength={15000}
                />
              </label>
              <input name="cover" type="hidden" value={project?.cover || ""} />
            </>
          )}
          {kind === "task" && (
            <>
              {projectSelect}
              <label>
                Work title
                <input
                  name="title"
                  defaultValue={task?.title}
                  placeholder="What needs to be done?"
                  required
                  maxLength={250}
                />
              </label>
              <label>
                Work type
                <select
                  name="workType"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value as WorkType)}
                >
                  {workTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              {contractor("Assigned contractor", true)}
              <div className="form-grid">
                <label>
                  {workType === "Task" ? "Due date" : "Scheduled date"}
                  <input
                    name="dueDate"
                    type="date"
                    defaultValue={task?.dueDate ?? editor.dueDate}
                  />
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    defaultValue={task?.priority || "Medium"}
                  >
                    {["Low", "Medium", "High"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="work-schedule-fields">
                <legend>
                  Time <span>optional · Eastern Time</span>
                </legend>
                <div className="form-grid">
                  <label>
                    Start time
                    <input
                      name="startTime"
                      type="time"
                      defaultValue={task?.startTime || ""}
                    />
                  </label>
                  <label>
                    End time
                    <input
                      name="endTime"
                      type="time"
                      defaultValue={task?.endTime || ""}
                    />
                  </label>
                </div>
                <p>
                  {workType === "Task"
                    ? "Leave times blank for a deadline, or add times for a booked work window."
                    : "Leave times blank until the visit or delivery time is confirmed."}
                </p>
              </fieldset>
              <label>
                Status
                <select name="status" defaultValue={task?.status || "To do"}>
                  {["To do", "In progress", "Done"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={task?.description}
                  placeholder="Add instructions or helpful context"
                  maxLength={15000}
                />
              </label>
            </>
          )}
          {kind === "contractor" && (
            <ContractorFields contractor={sub} workspace={workspace} />
          )}
          {kind === "scope" && (
            <>
              {projectSelect}
              <label>
                Work item
                <input
                  name="title"
                  defaultValue={item?.title}
                  placeholder="e.g. Flooring · luxury vinyl plank"
                  required
                  maxLength={250}
                />
              </label>
              <div className="form-grid">
                <label>
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    defaultValue={item?.quantity ?? 1}
                    required
                  />
                </label>
                <label>
                  Unit
                  <select name="unit" defaultValue={item?.unit || "job"}>
                    {["job", "sq ft", "linear ft", "each", "hours"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Price · total ($)
                  <input
                    name="estimate"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    defaultValue={item?.estimate ?? 0}
                    required
                  />
                </label>
                <label>
                  Subcontractor cost · total ($)
                  <input
                    name="subCost"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    defaultValue={item?.subCost ?? 0}
                    required
                  />
                </label>
              </div>
              <label>
                Material cost · total ($)
                <input
                  name="materialCost"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  defaultValue={item?.materialCost ?? 0}
                  aria-describedby="material-cost-help"
                  required
                />
              </label>
              <p id="material-cost-help" className="muted">
                Materials you pay for separately. Exclude materials already
                included in the subcontractor cost.
              </p>
              {contractor("Subcontractor for cost estimate")}
              <label>
                Status
                <select name="status" defaultValue={item?.status || "To do"}>
                  {["To do", "In progress", "Done"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy
              ? "Saving…"
              : entity
                ? "Save changes"
                : `Create ${names[kind]}`}
          </button>
        </footer>
      </form>
      {addingContractor && (
        <form
          ref={contractorForm}
          className="entity-form"
          onSubmit={createContractor}
        >
          <div className="form-fields">
            <ContractorFields workspace={workspace} />
            {contractorError && (
              <div className="alert" role="alert">
                {contractorError}
              </div>
            )}
          </div>
          <footer className="modal-footer">
            <button
              type="button"
              className="button secondary"
              disabled={contractorBusy}
              onClick={() => setAddingContractor(false)}
            >
              Back to work
            </button>
            <button className="button primary" disabled={contractorBusy}>
              {contractorBusy && <LoaderCircle size={16} className="spin" />}
              {contractorBusy ? "Saving…" : "Save & select contractor"}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
