"use client";
import { useEffect, useRef, useState } from "react";
import type {
  Contact,
  Entity,
  Project,
  Quote,
  Task,
  Contractor,
  ScopeItem,
  Workspace,
} from "@/lib/types";
import { Avatar, Modal } from "./ui";
import { Camera, LoaderCircle } from "lucide-react";
import ContractorFields from "./contractor-fields";
import { contactPhotoUrl } from "@/lib/contact-photo";
import AddressInput from "./address-input";
import { workTypes, type WorkType } from "@/lib/types";
import { workToday } from "@/lib/work";
import { contactAddress, customerContacts } from "@/lib/contacts";
import { projectMoney } from "@/lib/project-finances";
import CustomerContactPicker from "./customer-contact-picker";
import {
  lineTotal,
  quantityLabel,
  rateFromTotal,
  rateLabel,
  salePricingBases,
} from "@/lib/scope-pricing";
export type FormKind =
  "project" | "quote" | "task" | "contractor" | "scope" | "contact";
export interface Editor {
  kind: FormKind;
  entity?: Entity;
  initialValues?: Partial<Quote>;
  projectId?: string;
  dueDate?: string;
  workType?: WorkType;
}
export function EntityForm({
  editor,
  workspace,
  demo,
  onSave,
  onContactPhotoChanged,
  onClose,
}: {
  editor: Editor;
  workspace: Workspace;
  demo: boolean;
  onSave: (
    kind: FormKind,
    data: Record<string, unknown>,
    existing?: Entity,
  ) => Promise<Entity>;
  onContactPhotoChanged: (contact: Contractor) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const { kind, entity } = editor;
  const project = entity as Project | Quote | undefined;
  const projectValues = {
    ...editor.initialValues,
    ...project,
  } as Partial<Project | Quote>;
  const customer = entity as Contact | undefined;
  const initialContactId = String(
    (projectValues as Partial<Quote>).contactId ||
      (kind === "quote" && !entity ? "__new__" : ""),
  );
  const initialCustomer = workspace.contacts.find(
    (contact) => contact.id === initialContactId,
  );
  const [contactId, setContactId] = useState(initialContactId);
  const [clientName, setClientName] = useState(
    initialCustomer?.name || projectValues.client || "",
  );
  const [clientEmail, setClientEmail] = useState(
    initialCustomer?.email || projectValues.clientEmail || "",
  );
  const [clientPhone, setClientPhone] = useState(
    initialCustomer?.phone || projectValues.clientPhone || "",
  );
  const [clientAddress, setClientAddress] = useState(
    initialCustomer
      ? contactAddress(initialCustomer)
      : projectValues.address || "",
  );
  const [addressVersion, setAddressVersion] = useState(0);
  const availableCustomers = customerContacts(
    workspace.contacts,
    workspace.leads,
  );
  const selectedCustomer = workspace.contacts.find(
    (contact) => contact.id === contactId,
  );
  const customerEditable = contactId === "__new__" || !contactId;
  if (
    selectedCustomer &&
    !availableCustomers.some((contact) => contact.id === selectedCustomer.id)
  )
    availableCustomers.push(selectedCustomer);
  const [projectStatus, setProjectStatus] = useState<string>(
    projectValues.status || (kind === "quote" ? "Draft" : "Planning"),
  );
  const task = entity as Task | undefined;
  const [workType, setWorkType] = useState<WorkType>(
    task?.workType || editor.workType || "Task",
  );
  const sub = entity as Contractor | undefined;
  const item = entity as ScopeItem | undefined;
  const [scopeUnit, setScopeUnit] = useState(item?.unit || "job");
  const [scopeQuantity, setScopeQuantity] = useState(
    String(item?.quantity ?? 1),
  );
  const [scopeRate, setScopeRate] = useState(
    String(rateFromTotal(item?.estimate ?? 0, item?.quantity ?? 1)),
  );
  const scopeLineTotal = lineTotal(Number(scopeQuantity), Number(scopeRate));
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
    contractor: "contact",
    scope: "scope item",
    contact: "customer contact",
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
    if (busy || photoBusy || addingContractor) return;
    setBusy(true);
    setError("");
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (kind === "contact") {
      data.firstName = String(data.firstName || "").trim();
      data.lastName = String(data.lastName || "").trim();
      data.name = [data.firstName, data.lastName].filter(Boolean).join(" ");
      data.email = String(data.email || "").trim();
      data.phone = String(data.phone || "").trim();
      data.source = customer?.source || "Manual";
      if (!entity && !data.email && !data.phone) {
        setError("Enter an email address or phone number.");
        setBusy(false);
        return;
      }
    }
    if (kind === "quote") data.status = projectValues.status || "Draft";
    if (kind === "quote") {
      if (contactId === "__new__") {
        const name = String(data.client || "").trim();
        if (!name) {
          setError("Enter the customer's name to create their contact.");
          setBusy(false);
          return;
        }
        if (
          !String(data.clientEmail || "").trim() &&
          !String(data.clientPhone || "").trim()
        ) {
          setError(
            "Enter an email address or phone number for the new contact.",
          );
          setBusy(false);
          return;
        }
      } else if (!contactId && !entity) {
        setError("Choose a customer contact for this quote.");
        setBusy(false);
        return;
      }
    }
    for (const key of ["quantity", "estimate", "subCost", "materialCost"])
      if (key in data) data[key] = Number(data[key]);
    if (kind === "scope")
      data.estimate = lineTotal(Number(data.quantity), Number(data.estimate));
    try {
      if (kind === "quote" && contactId === "__new__") {
        const name = String(data.client || "").trim();
        const [firstName, ...last] = name.split(/\s+/);
        const created = await onSave("contact", {
          firstName,
          lastName: last.join(" "),
          name,
          email: String(data.clientEmail || "").trim(),
          phone: String(data.clientPhone || "").trim(),
          address: String(data.address || "").trim(),
          zip: "",
          source: "Quote",
        });
        data.contactId = created.id;
        setContactId(created.id);
      }
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
  async function changeContactPhoto(file?: File) {
    if (!sub || demo || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      let response: Response;
      if (file) {
        const form = new FormData();
        form.set("contactId", sub.id);
        form.set("file", file);
        response = await fetch("/api/contact-photos", {
          method: "POST",
          body: form,
        });
      } else {
        response = await fetch("/api/contact-photos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: sub.id }),
        });
      }
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not update contact photo.");
      onContactPhotoChanged(result.contact as Contractor);
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? error.message
          : "Could not update contact photo.",
      );
    } finally {
      setPhotoBusy(false);
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
            ? "Use a flat price or enter a quantity and rate to calculate the item total."
            : kind === "quote" && editor.initialValues?.leadId
              ? "Customer details are filled in. Review them, then create the quote."
              : "Keep the details your team needs in one place."
      }
      onClose={() => {
        if (busy || contractorBusy || photoBusy) return;
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
          {kind === "contact" && (
            <fieldset className="customer-record-fields">
              <legend>
                Customer <span>contact record</span>
              </legend>
              <div className="form-grid">
                <label>
                  First name
                  <input
                    name="firstName"
                    defaultValue={customer?.firstName}
                    required
                    maxLength={250}
                  />
                </label>
                <label>
                  Last name
                  <input
                    name="lastName"
                    defaultValue={customer?.lastName}
                    maxLength={250}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    defaultValue={customer?.email}
                    maxLength={250}
                    aria-describedby="contact-method-help"
                  />
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={customer?.phone}
                    maxLength={250}
                    aria-describedby="contact-method-help"
                  />
                </label>
              </div>
              <p className="contact-method-help" id="contact-method-help">
                Enter at least one: email or phone.
              </p>
              <AddressInput label="Address" defaultValue={customer?.address} />
              <label>
                ZIP code
                <input
                  name="zip"
                  defaultValue={customer?.zip}
                  maxLength={250}
                />
              </label>
            </fieldset>
          )}
          {(kind === "project" || kind === "quote") && (
            <>
              {kind === "quote" ? (
                <div className="form-grid">
                  <label>
                    Quote name
                    <input
                      name="name"
                      defaultValue={projectValues.name}
                      placeholder="e.g. Oakwood kitchen remodel"
                      required
                      maxLength={250}
                    />
                  </label>
                  <label>
                    Project type
                    <select
                      name="category"
                      defaultValue={projectValues.category || "Kitchen"}
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
              ) : (
                <label>
                  Project name
                  <input
                    name="name"
                    defaultValue={projectValues.name}
                    placeholder="e.g. Oakwood kitchen remodel"
                    required
                    maxLength={250}
                  />
                </label>
              )}
              {kind === "quote" ? (
                <fieldset className="customer-record-fields">
                  <legend>
                    Customer <span>contact record</span>
                  </legend>
                  <CustomerContactPicker
                    label="Find or add a contact"
                    contacts={availableCustomers.sort((a, b) =>
                      a.name.localeCompare(b.name),
                    )}
                    value={contactId}
                    allowEmpty={Boolean(entity)}
                    onChange={(id) => {
                      setContactId(id);
                      const selected = workspace.contacts.find(
                        (contact) => contact.id === id,
                      );
                      if (selected) {
                        setClientName(selected.name);
                        setClientEmail(selected.email);
                        setClientPhone(selected.phone);
                        setClientAddress(contactAddress(selected));
                        setAddressVersion((version) => version + 1);
                      } else if (id === "__new__") {
                        setClientName("");
                        setClientEmail("");
                        setClientPhone("");
                        setClientAddress("");
                        setAddressVersion((version) => version + 1);
                      }
                    }}
                  />
                  <p className="customer-record-help">
                    {customerEditable
                      ? "Enter the customer once. Saving this quote creates their contact record too."
                      : "These quote details come from the selected contact."}
                  </p>
                  <label>
                    Customer name
                    <input
                      name="client"
                      value={clientName}
                      onChange={(event) => setClientName(event.target.value)}
                      placeholder="Customer or family name"
                      maxLength={250}
                      readOnly={!customerEditable}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Email
                      <input
                        name="clientEmail"
                        type="email"
                        maxLength={250}
                        value={clientEmail}
                        onChange={(event) => setClientEmail(event.target.value)}
                        readOnly={!customerEditable}
                        aria-describedby={
                          customerEditable
                            ? "quote-contact-method-help"
                            : undefined
                        }
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        name="clientPhone"
                        type="tel"
                        maxLength={250}
                        value={clientPhone}
                        onChange={(event) => setClientPhone(event.target.value)}
                        readOnly={!customerEditable}
                        aria-describedby={
                          customerEditable
                            ? "quote-contact-method-help"
                            : undefined
                        }
                      />
                    </label>
                  </div>
                  {customerEditable && (
                    <p
                      className="contact-method-help"
                      id="quote-contact-method-help"
                    >
                      Enter at least one: email or phone.
                    </p>
                  )}
                  <AddressInput
                    key={`${contactId}-${addressVersion}`}
                    label="Address"
                    defaultValue={clientAddress}
                    readOnly={!customerEditable}
                  />
                </fieldset>
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      Client name
                      <input
                        name="client"
                        defaultValue={projectValues.client}
                        placeholder="Client or family name"
                        maxLength={250}
                      />
                    </label>
                    <label>
                      Project type
                      <select
                        name="category"
                        defaultValue={projectValues.category || "Kitchen"}
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
                        defaultValue={projectValues.clientEmail}
                      />
                    </label>
                    <label>
                      Client phone
                      <input
                        name="clientPhone"
                        type="tel"
                        maxLength={250}
                        defaultValue={projectValues.clientPhone}
                      />
                    </label>
                  </div>
                  <AddressInput defaultValue={projectValues.address} />
                </>
              )}
              {kind === "quote" && (
                <>
                  {(projectValues as Partial<Quote>).leadId && (
                    <input
                      type="hidden"
                      name="leadId"
                      value={(projectValues as Partial<Quote>).leadId}
                    />
                  )}
                  <fieldset className="work-schedule-fields">
                    <legend>
                      Quote document <span>shown on the downloaded PDF</span>
                    </legend>
                    <label>
                      Notes
                      <textarea
                        name="quoteNotes"
                        rows={3}
                        maxLength={15000}
                        defaultValue={
                          (projectValues as Partial<Quote>).quoteNotes || ""
                        }
                        placeholder="Add any notes for this quote."
                      />
                    </label>
                  </fieldset>
                </>
              )}
              {kind === "project" && (
                <label>
                  Status
                  <select
                    name="status"
                    value={projectStatus}
                    onChange={(event) => setProjectStatus(event.target.value)}
                  >
                    {["Planning", "In progress", "On hold", "Completed"].map(
                      (status) => (
                        <option key={status}>{status}</option>
                      ),
                    )}
                  </select>
                </label>
              )}
              <div className="form-grid">
                <label>
                  Start date
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={projectValues.startDate}
                  />
                </label>
                <label>
                  Target completion
                  <input
                    name="endDate"
                    type="date"
                    defaultValue={projectValues.endDate}
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
                      projectValues.completedDate ||
                      (projectValues.status === "Completed" ? "" : workToday())
                    }
                  />
                </label>
              )}
              {kind === "project" ? (
                <label>
                  Full scope of work
                  <textarea
                    name="description"
                    rows={4}
                    defaultValue={projectValues.description}
                    placeholder="Describe the work, materials, and details for this project."
                    maxLength={15000}
                  />
                </label>
              ) : (
                <input
                  type="hidden"
                  name="description"
                  value={projectValues.description || ""}
                />
              )}
              <input
                name="cover"
                type="hidden"
                value={projectValues.cover || ""}
              />
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
            <>
              {sub && (
                <div className="contact-photo-field">
                  <Avatar name={sub.name} photoUrl={contactPhotoUrl(sub)} />
                  <div className="contact-photo-details">
                    <strong>Contact photo</strong>
                    <p>
                      {demo
                        ? "Sign in to your workspace to add a photo."
                        : "JPG, PNG, or WebP up to 4 MB. Photo changes save immediately."}
                    </p>
                    <div className="contact-photo-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || photoBusy || demo}
                        onClick={() => photoInput.current?.click()}
                      >
                        <Camera size={15} />
                        {photoBusy
                          ? "Saving photo…"
                          : sub.photoPath
                            ? "Change photo"
                            : "Add photo"}
                      </button>
                      {sub.photoPath && !demo && (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy || photoBusy}
                          onClick={() => void changeContactPhoto()}
                        >
                          Remove photo
                        </button>
                      )}
                      <input
                        ref={photoInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Contact photo"
                        hidden
                        disabled={busy || photoBusy || demo}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) void changeContactPhoto(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </div>
                    {photoError && (
                      <div className="alert" role="alert">
                        {photoError}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <ContractorFields contractor={sub} workspace={workspace} />
            </>
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
              <label>
                Scope details
                <textarea
                  name="details"
                  rows={3}
                  defaultValue={item?.details || ""}
                  placeholder="Measurements, selections, allowances, or other specifications"
                  maxLength={15000}
                />
              </label>
              <div className="form-grid">
                <label>
                  Price by
                  <select
                    name="unit"
                    value={scopeUnit}
                    onChange={(event) => {
                      const nextUnit = event.target.value;
                      setScopeQuantity("1");
                      setScopeRate(String(scopeLineTotal));
                      setScopeUnit(nextUnit);
                    }}
                  >
                    {salePricingBases.map((basis) => (
                      <option key={basis.value} value={basis.value}>
                        {basis.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {quantityLabel(scopeUnit)}
                  <input
                    name="quantity"
                    type="number"
                    min="0"
                    max="1000000000"
                    step={
                      scopeUnit === "job" || scopeUnit === "each" ? "1" : "0.01"
                    }
                    value={scopeQuantity}
                    onChange={(event) => setScopeQuantity(event.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  {rateLabel(scopeUnit)} ($)
                  <input
                    name="estimate"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="any"
                    value={scopeRate}
                    onChange={(event) => setScopeRate(event.target.value)}
                    required
                  />
                  <small className="scope-rate-total">
                    Line total: {projectMoney(scopeLineTotal)}
                  </small>
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
            disabled={busy || photoBusy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy || photoBusy}>
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
