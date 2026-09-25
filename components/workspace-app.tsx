"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  HardHat,
  Users,
  Settings,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Grid2X2,
  List,
  MapPin,
  MapPinned,
  LocateFixed,
  CalendarDays,
  Check,
  Clock3,
  CircleDollarSign,
  ExternalLink,
  LogOut,
  Menu,
  X,
  ArrowRight,
  ArrowLeft,
  CircleAlert,
  RefreshCw,
  Phone,
  Mail,
  Pencil,
  CheckCheck,
  SlidersHorizontal,
  WandSparkles,
  FileText,
  Inbox,
  Footprints,
} from "lucide-react";
import { demoWorkspace } from "@/lib/demo";
import { contractorServices } from "@/lib/contractor-services";
import {
  emptyWorkspace,
  kindKey,
  type Entity,
  type EntityKind,
  type Project,
  type Task,
  type User,
  type Workspace,
  type Activity,
  type Attachment,
  type Quote,
  type ScopeItem,
  type WorkspaceAlert,
  type Contact,
  type Lead,
  type DoorVisit,
} from "@/lib/types";
import { dateLabel, overdue, projectReference } from "@/lib/utils";
import {
  scopeTotal,
  projectMoney as money,
  preserveScopeCosts,
} from "@/lib/project-finances";
import { acceptedQuote, preserveProjectHistory } from "@/lib/quotes";
import {
  leadDisposition,
  leadPatchFromQuote,
  quotePrefillFromLead,
  withDispositionChange,
} from "@/lib/leads";
import QuotesPanel, { QuoteDetail } from "./quotes-panel";
import { schemas } from "@/lib/schemas";
import { Avatar, Badge, Empty, Loading, Modal } from "./ui";
import { EntityForm, type Editor } from "./entity-form";
import ProjectDetail, { projectTabs, type ProjectTab } from "./project-detail";
import UpcomingPanel from "./upcoming-panel";
import type { UpcomingView } from "@/lib/work";
import { workToday } from "@/lib/work";
import { contractClock, projectDates } from "@/lib/project-timing";
import TeamPanel from "./team-panel";
import SettingsPanel from "./settings-panel";
import GeneratePanel from "./generate-panel";
import JobActivity from "./job-activity";
import RecentActivity from "./recent-activity";
import { ThemeToggle } from "./theme-controls";
import ActivityLogForm from "./activity-log-form";
import { completedWorkActivity, demoActivityMembers } from "@/lib/activity";
import TeamMapPanel from "./team-map-panel";
import { useLocationSharing } from "./use-location-sharing";
import { checkUploadFile, FILE_VALIDATION_VERSION } from "@/lib/file-policy";
import OverviewAlerts from "./overview-alerts";
import LeadsPanel from "./leads-panel";
import DoorKnockingPanel, { type DoorVisitDraft } from "./door-knocking-panel";
type Page =
  | "Overview"
  | "Projects"
  | "Quotes"
  | "Leads"
  | "Door knocking"
  | "Upcoming"
  | "Activity"
  | "Contractors"
  | "Generate"
  | "Team"
  | "Team map"
  | "Settings";
const demoKey = "premium-remodel-sample-v1";
export default function WorkspaceApp({
  user,
  demo = false,
}: {
  user: User;
  demo?: boolean;
}) {
  const locationSharing = useLocationSharing(user, demo);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const workspaceRef = useRef(workspace);
  const [loaded, setLoaded] = useState(false);
  const [contractToday, setContractToday] = useState(workToday);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState<Page>(
    user.group === "doorknocker" ? "Door knocking" : "Overview",
  );
  const [projectId, setProjectId] = useState("");
  const [projectTab, setProjectTab] = useState<ProjectTab>("Overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All projects");
  const [upcomingView, setUpcomingView] = useState<UpcomingView>("Calendar");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("Recently updated");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activityProject, setActivityProject] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<
    "Payment received" | "General update"
  >("General update");
  const logActivity = (
    id = "",
    type: "Payment received" | "General update" = "General update",
  ) => {
    setActivityType(type);
    setActivityProject(id);
  };
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [deleting, setDeleting] = useState<{
    kind: EntityKind;
    entity: Entity;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const pending = useRef(new Set<string>());
  const syncVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(
        () => setToast(null),
        toast.error ? 8000 : 4000,
      );
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  const commit = useCallback(
    (next: Workspace, persist = false) => {
      if (demo && persist) localStorage.setItem(demoKey, JSON.stringify(next));
      workspaceRef.current = next;
      setWorkspace(next);
    },
    [demo],
  );
  const refresh = useCallback(async () => {
    const version = syncVersion.current;
    try {
      if (demo) {
        const stored = localStorage.getItem(demoKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.tasks))
            throw new Error(
              "Sample data could not be loaded. Clear this site's sample storage to start again.",
            );
          commit({ ...emptyWorkspace, ...parsed });
        } else commit(demoWorkspace());
      } else {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (version === syncVersion.current && !pending.current.size)
          commit(data);
      }
      setLoadError("");
      setLoaded(true);
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? e.message
          : "Could not load the workspace. Please try again.",
      );
    }
  }, [demo, commit]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const updateDay = () => setContractToday(workToday());
    const interval = setInterval(() => {
      updateDay();
      if (!demo && !document.hidden && !pending.current.size) void refresh();
    }, 30000);
    window.addEventListener("focus", updateDay);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", updateDay);
    };
  }, [demo, refresh]);
  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.search);
      const legacyPage = params.get("view");
      const nextPage =
        legacyPage === "Tasks" || legacyPage === "Calendar"
          ? "Upcoming"
          : legacyPage;
      const allowedPages: Page[] =
        user.group === "doorknocker"
          ? ["Door knocking", "Upcoming", "Team map", "Settings"]
          : [
              "Overview",
              "Projects",
              "Quotes",
              "Leads",
              "Door knocking",
              "Upcoming",
              "Activity",
              "Contractors",
              "Generate",
              "Team",
              "Team map",
              "Settings",
            ];
      setPage(
        allowedPages.includes(nextPage as Page)
          ? (nextPage as Page)
          : user.group === "doorknocker"
            ? "Door knocking"
            : "Overview",
      );
      setProjectId(
        user.group === "doorknocker" ? "" : params.get("project") || "",
      );
      const legacyTab = params.get("tab");
      const nextTab =
        legacyTab === "Tasks" || legacyTab === "Calendar"
          ? "Upcoming"
          : legacyTab === "Updates"
            ? "Activity"
            : legacyTab;
      setUpcomingView(params.get("layout") === "List" ? "List" : "Calendar");
      setProjectTab(
        projectTabs.includes(nextTab as ProjectTab)
          ? (nextTab as ProjectTab)
          : "Overview",
      );
    }
    const timer = setTimeout(readLocation, 0);
    window.addEventListener("popstate", readLocation);
    const keydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("keydown", keydown);
    };
  }, [user.group]);
  function navigate(
    next: Page,
    id = "",
    tab: ProjectTab = "Overview",
    layout: UpcomingView = "Calendar",
  ) {
    setPage(next);
    setProjectId(id);
    setProjectTab(tab);
    setUpcomingView(layout);
    setSidebar(false);
    setSearch("");
    setFilter("All projects");
    const params = new URLSearchParams({ view: next });
    if (id) params.set("project", id);
    if (id && tab !== "Overview") params.set("tab", tab);
    if (next === "Upcoming" || (id && tab === "Upcoming"))
      params.set("layout", layout);
    window.history.pushState(null, "", `${demo ? "/demo" : "/"}?${params}`);
    window.scrollTo({ top: 0 });
  }
  function changeProjectTab(tab: ProjectTab) {
    if (tab === projectTab) return;
    setProjectTab(tab);
    setUpcomingView("Calendar");
    const params = new URLSearchParams(window.location.search);
    params.delete("layout");
    if (tab === "Overview") params.delete("tab");
    else params.set("tab", tab);
    window.history.pushState(null, "", `${demo ? "/demo" : "/"}?${params}`);
  }
  function changeUpcomingView(layout: UpcomingView) {
    setUpcomingView(layout);
    const params = new URLSearchParams(window.location.search);
    params.set("view", projectId ? "Projects" : "Upcoming");
    if (projectId) params.set("tab", "Upcoming");
    params.set("layout", layout);
    window.history.pushState(null, "", (demo ? "/demo" : "/") + "?" + params);
  }
  async function save(
    kind: EntityKind,
    data: Record<string, unknown>,
    existing?: Entity,
    requestId?: string,
  ) {
    const key = existing?.id || `new-${kind}`;
    if (pending.current.has(key))
      throw new Error("A save is already in progress. Please wait.");
    pending.current.add(key);
    syncVersion.current++;
    try {
      let entity: Entity;
      let relatedActivity: Activity | null = null;
      if (demo) {
        if (kind === "project")
          data = projectDates(data, existing as Project | undefined);
        if (kind === "scope")
          data = preserveScopeCosts(data, existing as ScopeItem | undefined);
        if (kind !== "attachment") {
          const legacyLead = kind === "lead" ? { ...data } : null;
          const parsed = schemas[kind].safeParse(
            legacyLead
              ? {
                  ...data,
                  contactId:
                    typeof data.contactId === "string" &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                      data.contactId,
                    )
                      ? data.contactId
                      : crypto.randomUUID(),
                  canvasserId:
                    typeof data.canvasserId === "string" &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                      data.canvasserId,
                    )
                      ? data.canvasserId
                      : undefined,
                }
              : data,
          );
          if (!parsed.success) throw new Error(parsed.error.issues[0].message);
          data = parsed.data;
          if (legacyLead) {
            data.contactId = legacyLead.contactId;
            if (legacyLead.canvasserId)
              data.canvasserId = legacyLead.canvasserId;
          }
        }
        const now = new Date().toISOString();
        if (kind === "alert") {
          if (user.role !== "admin")
            throw new Error("Only administrators can manage alerts.");
          if (existing) {
            const alert = existing as WorkspaceAlert;
            const now = Date.now();
            const expiresAt = Date.parse(String(data.expiresAt || ""));
            if (!Number.isFinite(expiresAt) || expiresAt <= now)
              throw new Error("Choose an expiration time in the future.");
            if (expiresAt > now + 525_600 * 60_000)
              throw new Error("Alerts can expire up to one year from now.");
            data = {
              ...data,
              audiences: alert.audiences,
              durationMinutes: Math.max(
                1,
                Math.ceil((expiresAt - now) / 60_000),
              ),
              expiresAt: new Date(expiresAt).toISOString(),
              authorId: alert.authorId,
              authorName: alert.authorName,
              lastEditedById: user.id,
              lastEditedByName: user.name,
              lastEditedAt: new Date(now).toISOString(),
            };
          } else {
            data = {
              ...data,
              expiresAt: new Date(
                Date.now() + Number(data.durationMinutes) * 60_000,
              ).toISOString(),
              authorId: user.id,
              authorName: user.name,
            };
          }
        }
        if (kind === "project" || kind === "quote") {
          data = preserveProjectHistory(
            data,
            existing as Project | Quote | undefined,
          );
          if (kind === "quote") {
            const prior = existing as Quote | undefined;
            if (data.status === "Sent" && prior?.status !== "Sent")
              data.quoteSentAt = now;
            if (
              (data.status === "Declined" || data.status === "Expired") &&
              prior?.status !== data.status
            )
              data.outcomeAt = now;
          }
        }
        if (kind === "lead") {
          const currentLead = (existing as Lead | undefined) || {
            disposition: "Active",
            dispositionHistory: [],
          };
          const nextDisposition =
            (data.disposition as Lead["disposition"]) ||
            leadDisposition(currentLead as Lead);
          if (
            existing &&
            nextDisposition !== leadDisposition(existing as Lead)
          ) {
            Object.assign(
              data,
              withDispositionChange(existing as Lead, nextDisposition, {
                id: user.id,
                name: user.name,
              }),
            );
          } else {
            data.disposition = nextDisposition;
          }
        }
        if (kind === "activity") {
          const actor = demoActivityMembers(user).find(
            (member) => member.id === data.actorId,
          );
          if (!actor) throw new Error("Choose an existing teammate.");
          data = {
            ...data,
            actorName: actor.name,
            authorId: user.id,
            authorName: user.name,
          };
          const previous = (workspaceRef.current.activities || []).find(
            (item) => item.id === requestId,
          );
          if (previous) return previous;
        }
        if (kind === "task") {
          const previous = existing as Task | undefined;
          if (data.status === "Done" && previous?.status !== "Done")
            data.completion = {
              id: crypto.randomUUID(),
              at: now,
              byId: user.id,
              byName: user.name,
            };
          else if (previous?.completion) data.completion = previous.completion;
        }
        entity = {
          ...data,
          ...(kind === "comment"
            ? { authorId: user.id, authorName: user.name }
            : {}),
          id: existing?.id || requestId || crypto.randomUUID(),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        } as Entity;
        if (kind === "comment" && requestId) {
          const previous = workspaceRef.current.comments.find(
            (item) => item.id === requestId,
          );
          if (previous) return previous;
        }
        if (
          kind === "task" &&
          data.status === "Done" &&
          (existing as Task | undefined)?.status !== "Done"
        )
          relatedActivity = completedWorkActivity(entity as Task);
      } else {
        const response = await fetch("/api/workspace", {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            data,
            id: existing?.id,
            updatedAt: existing?.updatedAt,
            requestId,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        const { relatedActivity: activity, ...record } = result;
        relatedActivity = activity || null;
        entity = record;
      }
      const collection = kindKey[kind];
      const current = workspaceRef.current;
      let leads = current.leads;
      if (demo && kind === "quote") {
        const quote = entity as Quote;
        if (quote.leadId) {
          leads = current.leads.map((lead) => {
            if (lead.id !== quote.leadId) return lead;
            const patch = leadPatchFromQuote(lead, quote);
            return patch
              ? { ...lead, ...patch, updatedAt: new Date().toISOString() }
              : lead;
          });
        }
      }
      commit(
        {
          ...current,
          leads,
          [collection]: existing
            ? (current[collection] as Entity[]).map((item) =>
                item.id === existing.id ? entity : item,
              )
            : [
                entity,
                ...(current[collection] || []).filter(
                  (item) => item.id !== entity.id,
                ),
              ],
          ...(relatedActivity
            ? {
                activities: [
                  relatedActivity,
                  ...(current.activities || []).filter(
                    (item) => item.id !== relatedActivity.id,
                  ),
                ],
              }
            : {}),
        },
        true,
      );
      if (!demo)
        window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      notify(
        existing
          ? "Changes saved"
          : {
              project: "Project created",
              quote: "Quote created",
              task: "Work added",
              contractor: "Contractor added",
              scope: "Scope item added",
              comment: "Note added",
              attachment: "File uploaded",
              activity: "Activity logged",
              alert: "Alert posted",
              contact: "Contact created",
              lead: "Lead created",
              door_visit: "House visit saved",
            }[kind],
      );
      if (kind === "quote" && !existing) navigate("Quotes", entity.id);
      return entity;
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError")
        throw new Error(
          "Sample storage is full. Use smaller files or sign in to the real workspace.",
        );
      throw e;
    } finally {
      pending.current.delete(key);
      syncVersion.current++;
    }
  }
  async function accept(quote: Quote) {
    if (pending.current.has(quote.id))
      throw new Error("A save is already in progress.");
    pending.current.add(quote.id);
    syncVersion.current++;
    try {
      let project: Project;
      if (demo)
        project = acceptedQuote(quote, user.id, new Date().toISOString());
      else {
        const response = await fetch("/api/quotes/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: quote.id, updatedAt: quote.updatedAt }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        project = result;
      }
      const current = workspaceRef.current;
      commit(
        {
          ...current,
          quotes: (current.quotes || []).filter((item) => item.id !== quote.id),
          projects: [
            project,
            ...current.projects.filter((item) => item.id !== project.id),
          ],
          leads: quote.leadId
            ? current.leads.map((lead) =>
                lead.id === quote.leadId
                  ? {
                      ...lead,
                      status: "Won" as const,
                      updatedAt: new Date().toISOString(),
                    }
                  : lead,
              )
            : current.leads,
        },
        true,
      );
      if (!demo)
        window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      navigate("Projects", project.id);
      notify("Quote accepted · project ready to plan");
    } finally {
      pending.current.delete(quote.id);
      syncVersion.current++;
    }
  }
  async function saveDoorVisit(data: DoorVisitDraft) {
    const key = "new-door-visit";
    if (pending.current.has(key))
      throw new Error("A visit is already being saved. Please wait.");
    pending.current.add(key);
    syncVersion.current++;
    try {
      let visit: DoorVisit;
      let contact: Contact | null = null;
      let lead: Lead | null = null;
      if (demo) {
        const parsedVisit = schemas.door_visit.safeParse({
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          visitedAt: data.visitedAt,
          outcome: data.outcome,
          notes: data.notes,
          canvasserId: user.id,
          canvasserName: user.name,
        });
        if (!parsedVisit.success)
          throw new Error(parsedVisit.error.issues[0].message);
        const now = new Date().toISOString();
        const leadId = data.createLead ? crypto.randomUUID() : undefined;
        visit = {
          ...parsedVisit.data,
          ...(leadId ? { leadId } : {}),
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        if (data.createLead) {
          const contactId = crypto.randomUUID();
          const name = `${data.firstName} ${data.lastName}`.trim();
          contact = {
            id: contactId,
            firstName: data.firstName,
            lastName: data.lastName,
            name,
            email: data.email,
            phone: data.phone,
            zip: data.zip,
            address: data.address,
            source: "Door knocking",
            createdAt: now,
            updatedAt: now,
          };
          lead = {
            id: leadId!,
            contactId,
            name,
            project: data.project,
            projectDescription: data.projectDescription,
            status: "New",
            disposition: "Active",
            approvalState: "none",
            source: "Door knocking",
            submittedAt: now,
            canvasserId: user.id,
            canvasserName: user.name,
            ...(data.scheduleQuote
              ? {
                  quoteDate: data.quoteDate,
                  quoteStartTime: data.quoteStartTime,
                  quoteEndTime: data.quoteEndTime,
                  quoteNotes: data.quoteNotes,
                }
              : {}),
            createdAt: now,
            updatedAt: now,
          };
        }
      } else {
        const response = await fetch("/api/door-knocking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        visit = result.visit;
        contact = result.contact || null;
        lead = result.lead || null;
      }
      const current = workspaceRef.current;
      commit(
        {
          ...current,
          doorVisits: [visit, ...current.doorVisits],
          contacts: contact ? [contact, ...current.contacts] : current.contacts,
          leads: lead ? [lead, ...current.leads] : current.leads,
        },
        true,
      );
      if (!demo)
        window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      notify(
        lead?.quoteDate
          ? "Visit, lead, and consultation saved"
          : lead
            ? "Visit and lead saved"
            : "House visit saved",
      );
    } finally {
      pending.current.delete(key);
      syncVersion.current++;
    }
  }
  async function upload(file: File, projectId: string): Promise<Attachment> {
    const fileInfo = await checkUploadFile(file);
    if (demo) {
      const path = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(new Blob([file], { type: fileInfo.mime }));
      });
      return (await save("attachment", {
        projectId,
        name: fileInfo.name,
        mime: fileInfo.mime,
        validationVersion: FILE_VALIDATION_VERSION,
        size: file.size,
        storage: "local",
        path,
        authorName: user.name,
      })) as Attachment;
    } else {
      pending.current.add("upload");
      syncVersion.current++;
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("projectId", projectId);
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        const current = workspaceRef.current;
        commit({ ...current, attachments: [result, ...current.attachments] });
        window.dispatchEvent(new Event("premium-remodel-audit-updated"));
        notify("File uploaded");
        return result as Attachment;
      } finally {
        pending.current.delete("upload");
        syncVersion.current++;
      }
    }
  }
  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    pending.current.add("delete");
    syncVersion.current++;
    try {
      if (!demo) {
        const response = await fetch(
          deleting.kind === "attachment" ? "/api/files" : "/api/workspace",
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: deleting.kind,
              id: deleting.entity.id,
            }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
      }
      const key = kindKey[deleting.kind];
      const current = workspaceRef.current;
      commit(
        {
          ...current,
          [key]: (current[key] as Entity[]).filter(
            (item) => item.id !== deleting.entity.id,
          ),
        },
        true,
      );
      if (!demo)
        window.dispatchEvent(new Event("premium-remodel-audit-updated"));
      setDeleting(null);
      notify("Record deleted");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not delete. Please try again.",
        true,
      );
    } finally {
      setDeleteBusy(false);
      pending.current.delete("delete");
      syncVersion.current++;
    }
  }
  const toggle = (task: Task) => {
    void save(
      "task",
      { ...task, status: task.status === "Done" ? "To do" : "Done" },
      task,
    ).catch((e) => notify(e.message, true));
  };
  const requestDelete = (kind: EntityKind, entity: Entity) =>
    setDeleting({ kind, entity });
  const selected = workspace.projects.find((p) => p.id === projectId);
  const selectedQuote = (workspace.quotes || []).find(
    (quote) => quote.id === projectId,
  );
  const openTasks = workspace.tasks.filter((t) => t.status !== "Done");
  const lateTasks = openTasks.filter((t) => overdue(t.dueDate, t.status));
  const activeProjects = workspace.projects.filter(
    (p) => p.status === "In progress",
  );
  const visibleProjects = workspace.projects
    .filter(
      (p) =>
        (filter === "All projects" || p.status === filter) &&
        `${p.name} ${p.address} ${p.client} ${p.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Name A–Z"
        ? a.name.localeCompare(b.name)
        : sort === "Scope value"
          ? scopeTotal(workspace.scope, b.id) -
            scopeTotal(workspace.scope, a.id)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const services = Array.from(
    new Map(
      workspace.contractors.flatMap((contractor) =>
        contractorServices(contractor.trade).map(
          (service) =>
            [
              `service:${service.toLowerCase()}`,
              service || "Not specified",
            ] as const,
        ),
      ),
    ),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const visibleContractors = workspace.contractors
    .filter(
      (contractor) =>
        (serviceFilter === "all" ||
          contractorServices(contractor.trade).some(
            (service) => `service:${service.toLowerCase()}` === serviceFilter,
          )) &&
        `${contractor.name} ${contractor.company} ${contractorServices(contractor.trade).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const serviceA = contractorServices(a.trade)[0];
      const serviceB = contractorServices(b.trade)[0];
      // Keep unclassified contacts at the end, then sort names within services.
      if (!!serviceA !== !!serviceB) return serviceA ? -1 : 1;
      const byService = serviceA.localeCompare(serviceB, "en", {
        sensitivity: "base",
      });
      if (byService) return byService;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
  const menus: { name: Page; icon: typeof LayoutDashboard; count?: number }[] =
    user.group === "doorknocker"
      ? [
          { name: "Door knocking", icon: Footprints },
          { name: "Upcoming", icon: CalendarDays },
        ]
      : [
          { name: "Overview", icon: LayoutDashboard },
          { name: "Projects", icon: FolderKanban },
          { name: "Quotes", icon: FileText },
          {
            name: "Leads",
            icon: Inbox,
            count: workspace.leads.length,
          },
          { name: "Door knocking", icon: Footprints },
          { name: "Upcoming", icon: CalendarDays, count: openTasks.length },
          { name: "Contractors", icon: HardHat },
          { name: "Generate", icon: WandSparkles },
        ];
  function projectCard(project: Project) {
    const clock = contractClock(project, contractToday);
    const tasks = workspace.tasks.filter((t) => t.projectId === project.id);
    const done = tasks.filter((t) => t.status === "Done").length;
    const progress = tasks.length
      ? Math.round((done / tasks.length) * 100)
      : project.status === "Completed"
        ? 100
        : 0;
    const selectedPhoto = project.coverAttachmentId
      ? workspace.attachments.find(
          (file) =>
            file.id === project.coverAttachmentId &&
            file.projectId === project.id &&
            file.mime.startsWith("image/"),
        )
      : undefined;
    const photo =
      selectedPhoto ||
      workspace.attachments.find(
        (file) =>
          file.projectId === project.id && file.mime.startsWith("image/"),
      );
    const cover = photo
      ? demo
        ? photo.path
        : `/api/files?id=${photo.id}`
      : project.cover;
    return (
      <button
        className={`project-card ${view === "list" ? "project-list-card" : ""}`}
        key={project.id}
        onClick={() => navigate("Projects", project.id)}
      >
        {cover && (
          <div className="project-cover">
            <img src={cover} alt={`${project.name} project`} loading="lazy" />
            <span className="project-open-icon">
              <ArrowUpRight size={19} />
            </span>
          </div>
        )}
        <div className="project-card-body">
          <div className="project-card-top">
            <div className="project-card-badges">
              <span className="badge badge-category">
                {project.category || "Remodel"}
              </span>
              <Badge status={project.status} />
            </div>
            <span className="project-id">{projectReference(project.id)}</span>
          </div>
          <h3>{project.name}</h3>
          <p className="card-address">
            <MapPin size={12} />
            {project.address || "Address not added"}
          </p>
          <div className="card-finances">
            <div>
              <span>Scope total</span>
              <strong>{money(scopeTotal(workspace.scope, project.id))}</strong>
            </div>
            <div>
              <span>Target completion</span>
              <strong className="card-date">
                {project.endDate
                  ? dateLabel(project.endDate).replace(/, \d{4}$/, "")
                  : "Not scheduled"}
              </strong>
            </div>
          </div>
          <div className="progress-caption">
            <span>Project work</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="project-card-footer">
            <span
              className="card-start-date contract-clock-compact"
              title={clock.detail}
            >
              <Clock3 size={14} />
              {clock.label}
            </span>
            <span className="card-task-count">
              <CheckCheck size={14} />
              {done}/{tasks.length} complete
            </span>
          </div>
        </div>
      </button>
    );
  }
  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebar(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <Link href={demo ? "/demo" : "/"} className="brand">
          <img src="/images/logo.png" alt="Premium Remodel" />
        </Link>
        <div className="workspace-switch">
          <span className="workspace-monogram">P</span>
          <div>
            <strong>Premium Remodel</strong>
            <span>{demo ? "Sample workspace" : "Company workspace"}</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {menus.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name || (page === "Activity" && item.name === "Overview") ? "active" : ""}`}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {!!item.count && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>
        <span className="nav-label team-label">COMPANY</span>
        <nav aria-label="Company navigation">
          <button
            className={`nav-item ${page === "Team map" ? "active" : ""}`}
            onClick={() => navigate("Team map")}
          >
            <MapPinned size={18} />
            Team map
          </button>
          {user.group !== "doorknocker" && (
            <button
              className={`nav-item ${page === "Team" ? "active" : ""}`}
              onClick={() => navigate("Team")}
            >
              <Users size={18} />
              Team
            </button>
          )}
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings size={18} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <a
            className="website-link"
            href="https://premiumremodel.com"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} />
            Visit our website
            <ArrowUpRight size={14} />
          </a>
          {demo && (
            <div className="sample-sidebar">
              <span className="sample-indicator" />
              You’re in the sample workspace.
              <Link href="/login">
                Set up your workspace
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
          <div className="profile">
            <Avatar name={user.name} />
            <button
              className="profile-info"
              onClick={() => navigate("Settings")}
            >
              <strong>{user.name}</strong>
              <span>
                {user.role === "admin"
                  ? "Administrator"
                  : user.group === "doorknocker"
                    ? "Door knocker"
                    : "Team member"}
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={demo ? "Exit sample workspace" : "Sign out"}
              onClick={async () => {
                await locationSharing.stop();
                if (!demo) {
                  try {
                    const r = await fetch("/api/auth", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "logout" }),
                    });
                    if (!r.ok)
                      throw new Error("Could not sign out. Try again.");
                  } catch (e) {
                    notify(
                      e instanceof Error ? e.message : "Could not sign out",
                      true,
                    );
                    return;
                  }
                }
                window.location.href = "/login";
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Premium Remodel</span>
            <ChevronRight size={13} />
            <strong>
              {selectedQuote ? "Quotes" : projectId ? "Projects" : page}
            </strong>
            {(selected || selectedQuote) && (
              <>
                <ChevronRight size={13} />
                <span className="breadcrumb-project">
                  {(selected || selectedQuote)?.name}
                </span>
              </>
            )}
          </div>
          <div className="topbar-right">
            {(locationSharing.sharing || locationSharing.pendingStop) && (
              <button
                className="icon-button location-indicator"
                aria-label={
                  locationSharing.pendingStop
                    ? "Location sharing stopped; removal pending"
                    : "Location sharing is on. Open sharing controls"
                }
                title={
                  locationSharing.pendingStop
                    ? "Location removal pending"
                    : "Sharing location"
                }
                onClick={() => navigate("Team map")}
              >
                <LocateFixed size={18} />
              </button>
            )}
            <ThemeToggle />
            {!projectId &&
              [
                "Overview",
                "Projects",
                "Quotes",
                "Leads",
                "Contractors",
              ].includes(page) && (
                <div className="global-search">
                  <Search size={16} />
                  <input
                    ref={searchInput}
                    aria-label={`Search ${page === "Overview" ? "projects" : page.toLowerCase()}`}
                    placeholder={`Search ${page === "Overview" ? "projects" : page.toLowerCase()}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search ? (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={13} />
                    </button>
                  ) : (
                    <kbd>⌘ K</kbd>
                  )}
                </div>
              )}
            <span className="topbar-separator" />
            <button
              className="topbar-avatar"
              aria-label="Account settings"
              onClick={() => navigate("Settings")}
            >
              <Avatar name={user.name} small />
            </button>
          </div>
        </header>
        <main className="main-content">
          {loadError && (
            <div className="alert load-error">
              <CircleAlert size={17} />
              {loadError}
              <button className="text-button" onClick={() => void refresh()}>
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}
          {!loaded ? (
            !loadError && <Loading />
          ) : selected ? (
            <ProjectDetail
              key={selected.id}
              project={selected}
              contractToday={contractToday}
              workspace={workspace}
              user={user}
              demo={demo}
              onBack={() => navigate("Projects")}
              onEdit={setEditor}
              onLogActivity={(id) => logActivity(id)}
              onLogPayment={(id) => logActivity(id, "Payment received")}
              onSave={async (...args) => {
                await save(...args);
              }}
              onDelete={requestDelete}
              onUpload={upload}
              onToggle={toggle}
              notify={notify}
              tab={projectTab}
              onTabChange={changeProjectTab}
              upcomingView={upcomingView}
              onUpcomingViewChange={changeUpcomingView}
            />
          ) : selectedQuote ? (
            <QuoteDetail
              key={selectedQuote.id}
              quote={selectedQuote}
              workspace={workspace}
              user={user}
              demo={demo}
              onBack={() => navigate("Quotes")}
              onEdit={setEditor}
              onSave={save}
              onAccept={accept}
              onDelete={requestDelete}
              onUpload={upload}
            />
          ) : projectId ? (
            <Empty
              title="Project not found"
              text="This project is no longer available."
              action={
                <button
                  className="button primary"
                  onClick={() => navigate("Projects")}
                >
                  Back to projects
                </button>
              }
            />
          ) : (
            <>
              {page === "Quotes" && (
                <QuotesPanel
                  workspace={workspace}
                  search={search}
                  onNew={() => setEditor({ kind: "quote" })}
                  onOpen={(id) => navigate("Quotes", id)}
                />
              )}
              {page === "Door knocking" && (
                <DoorKnockingPanel
                  workspace={workspace}
                  onSave={saveDoorVisit}
                />
              )}
              {page === "Leads" && (
                <LeadsPanel
                  leads={workspace.leads}
                  contacts={workspace.contacts}
                  quotes={workspace.quotes || []}
                  search={search}
                  demo={demo}
                  onSaveLead={(data, lead) => save("lead", data, lead)}
                  onQuote={(lead, contact, quote) => {
                    if (quote) {
                      navigate("Quotes", quote.id);
                      return;
                    }
                    setEditor({
                      kind: "quote",
                      initialValues: quotePrefillFromLead(lead, contact),
                    });
                  }}
                />
              )}
              {(page === "Overview" || page === "Projects") && (
                <>
                  {page === "Overview" && (
                    <OverviewAlerts
                      alerts={workspace.alerts || []}
                      user={user}
                    />
                  )}
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {page === "Overview"
                          ? "LET’S GET TO WORK"
                          : "THE BIG PICTURE"}
                      </span>
                      <h1>
                        {page === "Overview"
                          ? "Project overview"
                          : "All projects"}
                        <span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Track your jobs, coordinate your team, and keep work
                        moving.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setEditor({ kind: "project" })}
                    >
                      <Plus size={17} />
                      New project
                    </button>
                  </div>
                  {page === "Overview" && (
                    <div className="summary-strip">
                      <button
                        onClick={() => {
                          setFilter("In progress");
                        }}
                      >
                        <div>
                          <span>Active projects</span>
                          <FolderKanban size={17} />
                        </div>
                        <strong>
                          {activeProjects.length.toString().padStart(2, "0")}
                        </strong>
                        <small>
                          <span className="status-dot" />
                          {
                            workspace.projects.filter(
                              (p) => p.status === "Planning",
                            ).length
                          }{" "}
                          in planning
                        </small>
                      </button>
                      <button
                        onClick={() => {
                          navigate("Upcoming");
                        }}
                      >
                        <div>
                          <span>Open work</span>
                          <ListTodo size={18} />
                        </div>
                        <strong>
                          {openTasks.length.toString().padStart(2, "0")}
                        </strong>
                        <small>Across all your projects</small>
                      </button>
                      <button
                        onClick={() => {
                          navigate("Upcoming");
                        }}
                      >
                        <div>
                          <span>Needs attention</span>
                          <Clock3 size={17} />
                        </div>
                        <strong>
                          {lateTasks.length.toString().padStart(2, "0")}
                        </strong>
                        <small
                          className={lateTasks.length ? "attention-text" : ""}
                        >
                          {lateTasks.length
                            ? `${lateTasks.length} overdue work items`
                            : "Everything is on track"}
                          <ArrowUpRight size={12} />
                        </small>
                      </button>
                      <button onClick={() => setFilter("In progress")}>
                        <div>
                          <span>Active scope value</span>
                          <CircleDollarSign size={18} />
                        </div>
                        <strong className="money-stat">
                          {money(
                            activeProjects.reduce(
                              (sum, p) =>
                                sum + scopeTotal(workspace.scope, p.id),
                              0,
                            ),
                          )}
                        </strong>
                        <small>Total for projects in progress</small>
                      </button>
                    </div>
                  )}
                  {page === "Overview" && (
                    <RecentActivity
                      workspace={workspace}
                      onProject={(id) => navigate("Projects", id, "Activity")}
                      onShowMore={() => navigate("Activity")}
                    />
                  )}
                  <div className="projects-section-heading">
                    <div>
                      <h2>
                        Your projects{" "}
                        <span className="count-pill">
                          {workspace.projects.length}
                        </span>
                      </h2>
                      {demo && (
                        <span className="sample-data-label">SAMPLE DATA</span>
                      )}
                    </div>
                    <div className="view-options">
                      <button
                        aria-label="Grid view"
                        aria-pressed={view === "grid"}
                        className={view === "grid" ? "active" : ""}
                        onClick={() => setView("grid")}
                      >
                        <Grid2X2 size={17} />
                      </button>
                      <button
                        aria-label="List view"
                        aria-pressed={view === "list"}
                        className={view === "list" ? "active" : ""}
                        onClick={() => setView("list")}
                      >
                        <List size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="project-toolbar">
                    <div className="filter-tabs">
                      {[
                        "All projects",
                        "In progress",
                        "Planning",
                        "On hold",
                        "Completed",
                      ].map((f) => (
                        <button
                          key={f}
                          className={filter === f ? "active" : ""}
                          onClick={() => setFilter(f)}
                        >
                          {f}
                          {filter === f && (
                            <span>
                              {f === "All projects"
                                ? workspace.projects.length
                                : workspace.projects.filter(
                                    (p) => p.status === f,
                                  ).length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <label className="sort-select">
                      <SlidersHorizontal size={14} />
                      <select
                        aria-label="Sort projects"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        {["Recently updated", "Name A–Z", "Scope value"].map(
                          (s) => (
                            <option key={s}>{s}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  {visibleProjects.length ? (
                    <div
                      className={`project-grid ${view === "list" ? "list-view" : ""}`}
                    >
                      {visibleProjects.map(projectCard)}
                    </div>
                  ) : (
                    <Empty
                      title={
                        workspace.projects.length
                          ? "No matching projects"
                          : "Your next project starts here"
                      }
                      text={
                        workspace.projects.length
                          ? "Try a different search or project status."
                          : "Add a job, then build out the scope, costs, and next steps."
                      }
                      action={
                        <button
                          className="button primary"
                          onClick={() =>
                            workspace.projects.length
                              ? (setSearch(""), setFilter("All projects"))
                              : setEditor({ kind: "project" })
                          }
                        >
                          {workspace.projects.length ? (
                            "Clear filters"
                          ) : (
                            <>
                              <Plus size={16} />
                              Create first project
                            </>
                          )}
                        </button>
                      }
                    />
                  )}
                  <div className="workspace-footer">
                    <span>
                      <span className="live-dot" />
                      {demo
                        ? "Sample changes are saved in this browser"
                        : "Shared with your company · refreshes every 30 seconds"}
                    </span>
                    <span>Made for the way you work.</span>
                  </div>
                </>
              )}
              {page === "Upcoming" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">THE SCHEDULE</span>
                      <h1>
                        Upcoming<span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Tasks, inspections, deliveries, and visits across your
                        company.
                      </p>
                    </div>
                  </div>
                  <UpcomingPanel
                    workspace={workspace}
                    view={upcomingView}
                    onViewChange={changeUpcomingView}
                    onEditTask={(task) =>
                      setEditor({ kind: "task", entity: task })
                    }
                    onEditProject={(project) =>
                      setEditor({ kind: "project", entity: project })
                    }
                    onOpenProject={(id) =>
                      navigate("Projects", id, "Upcoming", upcomingView)
                    }
                    onOpenLead={(id) => {
                      const lead = workspace.leads.find(
                        (item) => item.id === id,
                      );
                      navigate("Leads");
                      setSearch(lead?.name || "");
                    }}
                    onAddWork={(dueDate, projectId, workType) =>
                      setEditor({ kind: "task", projectId, dueDate, workType })
                    }
                    onToggleTask={toggle}
                    onDeleteTask={(task) => requestDelete("task", task)}
                  />
                </>
              )}
              {page === "Contractors" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        THE PEOPLE BEHIND THE WORK
                      </span>
                      <h1>
                        Contractors<span className="heading-dot">.</span>
                      </h1>
                      <p>
                        Your trusted trades, contact details, and current
                        assignments.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setEditor({ kind: "contractor" })}
                    >
                      <Plus size={17} />
                      Add contractor
                    </button>
                  </div>
                  <div className="section-intro">
                    <HardHat size={19} />
                    <h2>Contractor directory</h2>
                    <span className="count-pill">
                      {workspace.contractors.length}
                    </span>
                  </div>
                  <div className="contractor-toolbar">
                    <label>
                      Service
                      <select
                        aria-label="Filter contractors by service"
                        value={serviceFilter}
                        onChange={(event) =>
                          setServiceFilter(event.target.value)
                        }
                      >
                        <option value="all">All services</option>
                        {services.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="contractor-result-count" role="status">
                      {visibleContractors.length} of{" "}
                      {workspace.contractors.length} contractors
                    </span>
                  </div>
                  <div className="contractor-list">
                    {visibleContractors.map((c) => {
                      const assignedTasks = workspace.tasks.filter(
                        (task) => task.contractorId === c.id,
                      );
                      return (
                        <article className="contractor-row" key={c.id}>
                          <Avatar name={c.name} />
                          <div className="contractor-info">
                            <h3>{c.name}</h3>
                            <p>{c.company || "Independent contractor"}</p>
                            <div className="contractor-service-tags">
                              {contractorServices(c.trade).map((service) => (
                                <span className="trade-label" key={service}>
                                  {service || "Service not specified"}
                                </span>
                              ))}
                            </div>
                            {c.notes && (
                              <p className="contractor-note">{c.notes}</p>
                            )}
                          </div>
                          <div className="contractor-contact">
                            {c.email && (
                              <a href={`mailto:${c.email}`}>
                                <Mail size={14} />
                                {c.email}
                              </a>
                            )}
                            {c.phone && (
                              <span className="contractor-phone">
                                {c.phone}
                              </span>
                            )}
                            {/\d/.test(c.phone) ? (
                              <a
                                className="button secondary contractor-call"
                                href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}
                                aria-label={`Call ${c.name}`}
                                title={`Call ${c.phone}`}
                              >
                                <Phone size={15} />
                                Call
                              </a>
                            ) : (
                              <span className="contractor-phone">
                                No phone number added
                              </span>
                            )}
                          </div>
                          <div className="contractor-assignments">
                            <span>
                              {assignedTasks.length} assigned{" "}
                              {assignedTasks.length === 1
                                ? "work item"
                                : "work items"}
                            </span>
                            {assignedTasks.slice(0, 3).map((task) => (
                              <div
                                className="contractor-assignment"
                                key={task.id}
                              >
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setEditor({ kind: "task", entity: task })
                                  }
                                >
                                  {task.title}
                                  <ArrowUpRight size={12} />
                                </button>
                                <small>
                                  {
                                    workspace.projects.find(
                                      (p) => p.id === task.projectId,
                                    )?.name
                                  }
                                </small>
                              </div>
                            ))}
                            {assignedTasks.length > 3 && (
                              <small>+ {assignedTasks.length - 3} more</small>
                            )}
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${c.name}`}
                            onClick={() =>
                              setEditor({ kind: "contractor", entity: c })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {!visibleContractors.length && (
                    <Empty
                      title={
                        workspace.contractors.length
                          ? "No matching contractors"
                          : "No contractors yet"
                      }
                      text={
                        workspace.contractors.length
                          ? "Try a different service or search to find your contractor."
                          : "Add your go-to trades and assign them to jobs."
                      }
                      action={
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (workspace.contractors.length) {
                              setServiceFilter("all");
                              setSearch("");
                            } else setEditor({ kind: "contractor" });
                          }}
                        >
                          {workspace.contractors.length ? (
                            "Clear filters"
                          ) : (
                            <>
                              <Plus size={16} />
                              Add contractor
                            </>
                          )}
                        </button>
                      }
                    />
                  )}
                  <p className="footnote">
                    Contractor contacts do not automatically receive app access.
                    Invite employees from the Team page.
                  </p>
                </>
              )}
              {page === "Team" && (
                <TeamPanel user={user} demo={demo} notify={notify} />
              )}
              {page === "Team map" && (
                <TeamMapPanel
                  user={user}
                  demo={demo}
                  sharing={locationSharing}
                  onInstall={() => navigate("Settings")}
                />
              )}
              {page === "Settings" && (
                <SettingsPanel
                  user={user}
                  demo={demo}
                  alerts={workspace.alerts || []}
                  onSaveAlert={(data, alert) => save("alert", data, alert)}
                  onRemoveAlert={(alert) => requestDelete("alert", alert)}
                />
              )}
              {page === "Activity" && (
                <>
                  <button
                    className="back-link"
                    onClick={() => navigate("Overview")}
                  >
                    <ArrowLeft size={15} />
                    Back to overview
                  </button>
                  <JobActivity
                    workspace={workspace}
                    user={user}
                    demo={demo}
                    onLog={(id = "") => logActivity(id)}
                    onDelete={requestDelete}
                    onProject={(id) => navigate("Projects", id, "Activity")}
                    onTask={(task) => setEditor({ kind: "task", entity: task })}
                  />
                </>
              )}
            </>
          )}
          {loaded && (
            <div hidden={page !== "Generate" || Boolean(projectId)}>
              <GeneratePanel
                demo={demo}
                active={page === "Generate" && !projectId}
              />
            </div>
          )}
        </main>
      </div>
      {editor && (
        <EntityForm
          key={`${editor.kind}-${editor.entity?.id || editor.initialValues?.leadId || "new"}`}
          editor={editor}
          workspace={workspace}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Modal
          title={`Delete this ${deleting.kind === "scope" ? "scope item" : deleting.kind === "attachment" ? "file" : deleting.kind === "comment" ? "note" : deleting.kind === "activity" ? "activity" : deleting.kind === "alert" ? "alert" : "work item"}?`}
          subtitle="This removes it for everyone in your workspace and cannot be undone."
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        >
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={deleteBusy}
              onClick={() => void remove()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleAlert size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {activityProject !== null && (
        <ActivityLogForm
          workspace={workspace}
          user={user}
          demo={demo}
          projectId={activityProject}
          initialType={activityType}
          onClose={() => setActivityProject(null)}
          onUpload={upload}
          onSave={async (data, requestId) => {
            await save("activity", data, undefined, requestId);
          }}
        />
      )}
    </div>
  );
}
