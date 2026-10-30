"use client";

import { useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { Modal } from "./ui";
import type { BusinessConfig } from "@/lib/business-config";
import {
  doorKnockerPages,
  navigationPages,
  type NavigationPage,
} from "@/lib/business-config-schema";
import { workspaceGroups, type WorkspaceGroup } from "@/lib/types";

const roleLabels: Record<WorkspaceGroup, string> = {
  owner: "Owner",
  admin: "Admin",
  office: "Office",
  crew: "Crew",
  field: "Field",
  doorknocker: "Door knocker",
};

const companyPages = new Set<NavigationPage>(["Team map", "Team", "Settings"]);

function tabLabel(page: NavigationPage) {
  return page === "Contractors" ? "Trade contacts" : page;
}

function sameSection(a: NavigationPage, b: NavigationPage) {
  return companyPages.has(a) === companyPages.has(b);
}

export default function RoleTabAccessEditor({
  roleNavigation,
  admin,
  onChange,
}: {
  roleNavigation: BusinessConfig["roleNavigation"];
  admin: boolean;
  onChange: (next: BusinessConfig["roleNavigation"]) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<WorkspaceGroup>("admin");
  const [editorOpen, setEditorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dragged, setDragged] = useState<NavigationPage | null>(null);
  const [dragOver, setDragOver] = useState<NavigationPage | null>(null);
  const pages = roleNavigation[selectedRole];
  const supportedPages =
    selectedRole === "doorknocker" ? doorKnockerPages : navigationPages;
  const availablePages = supportedPages.filter((page) => !pages.includes(page));

  function updateRole(nextPages: NavigationPage[]) {
    onChange({ ...roleNavigation, [selectedRole]: nextPages });
  }

  function addPage(page: NavigationPage) {
    updateRole([...pages, page]);
    setAddOpen(false);
  }

  function removePage(page: NavigationPage) {
    if (page === "Settings") return;
    updateRole(pages.filter((candidate) => candidate !== page));
  }

  function movePage(source: NavigationPage, target: NavigationPage) {
    if (source === target || !sameSection(source, target)) return;
    const next = [...pages];
    const sourceIndex = next.indexOf(source);
    const targetIndex = next.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    updateRole(next);
  }

  function moveBy(page: NavigationPage, direction: -1 | 1) {
    const section = pages.filter((candidate) => sameSection(candidate, page));
    const index = section.indexOf(page);
    const target = section[index + direction];
    if (target) movePage(page, target);
  }

  function beginDrag(event: DragEvent<HTMLDivElement>, page: NavigationPage) {
    if (!admin) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", page);
    setDragged(page);
  }

  function drop(event: DragEvent<HTMLDivElement>, target: NavigationPage) {
    event.preventDefault();
    const source = dragged || (event.dataTransfer.getData("text/plain") as NavigationPage);
    if (source) movePage(source, target);
    setDragged(null);
    setDragOver(null);
  }

  function section(title: string, items: NavigationPage[]) {
    return (
      <section className="role-tab-section" aria-label={`${title} tabs`}>
        <div className="role-tab-section-heading">
          <strong>{title}</strong>
          <span>{items.length}</span>
        </div>
        <div className="role-tab-sort-list">
          {items.length ? (
            items.map((page) => {
              const sectionItems = pages.filter((candidate) =>
                sameSection(candidate, page),
              );
              const index = sectionItems.indexOf(page);
              return (
                <div
                  key={page}
                  className={`role-tab-sort-row ${dragged === page ? "dragging" : ""} ${dragOver === page ? "drag-over" : ""}`}
                  draggable={admin}
                  onDragStart={(event) => beginDrag(event, page)}
                  onDragEnd={() => {
                    setDragged(null);
                    setDragOver(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOver(page);
                  }}
                  onDrop={(event) => drop(event, page)}
                >
                  <GripVertical size={17} aria-hidden="true" />
                  <span>{tabLabel(page)}</span>
                  {page === "Settings" && <small>Required</small>}
                  {admin && (
                    <div className="role-tab-row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${tabLabel(page)} up`}
                        disabled={index === 0}
                        onClick={() => moveBy(page, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${tabLabel(page)} down`}
                        disabled={index === sectionItems.length - 1}
                        onClick={() => moveBy(page, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Remove ${tabLabel(page)}`}
                        disabled={page === "Settings"}
                        onClick={() => removePage(page)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="role-tab-empty">No tabs in this section.</p>
          )}
        </div>
      </section>
    );
  }

  const workspaceTabs = pages.filter((page) => !companyPages.has(page));
  const companyTabs = pages.filter((page) => companyPages.has(page));

  return (
    <section className="role-access-editor" aria-label="Tab access by role">
      <div className="role-access-toolbar">
        <label>
          <span>Role</span>
          <select
            value={selectedRole}
            onChange={(event) =>
              setSelectedRole(event.target.value as WorkspaceGroup)
            }
          >
            {workspaceGroups.map((group) => (
              <option key={group} value={group}>
                {roleLabels[group]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button secondary role-access-configure"
          onClick={() => setEditorOpen(true)}
        >
          <Settings2 size={16} />
          {admin ? "Configure tabs" : "View tabs"}
        </button>
      </div>

      <div className="role-access-preview">
        <div className="role-access-preview-heading">
          <div>
            <span>LEFT NAVIGATION PREVIEW</span>
            <strong>{roleLabels[selectedRole]}</strong>
          </div>
          <small>{pages.length} tabs</small>
        </div>
        <div className="role-access-preview-group">
          <span>WORKSPACE</span>
          <div>
            {workspaceTabs.map((page) => (
              <span key={page}>{tabLabel(page)}</span>
            ))}
          </div>
        </div>
        <div className="role-access-preview-group">
          <span>COMPANY</span>
          <div>
            {companyTabs.map((page) => (
              <span key={page}>{tabLabel(page)}</span>
            ))}
          </div>
        </div>
      </div>

      {editorOpen && (
        <Modal
          title={`Configure ${roleLabels[selectedRole]} tabs`}
          subtitle="Drag tabs into order, remove anything this role should not see, or add a tab back."
          onClose={() => {
            setEditorOpen(false);
            setAddOpen(false);
          }}
        >
          <div className="role-tab-editor-body">
            {admin && (
              <div className="role-tab-add-wrap">
                <button
                  type="button"
                  className="button primary"
                  aria-expanded={addOpen}
                  onClick={() => setAddOpen((open) => !open)}
                >
                  <Plus size={16} /> Add tabs
                </button>
                {addOpen && (
                  <div className="role-tab-add-menu" role="menu" aria-label="Available tabs">
                    {availablePages.length ? (
                      availablePages.map((page) => (
                        <button
                          type="button"
                          role="menuitem"
                          key={page}
                          onClick={() => addPage(page)}
                        >
                          <Plus size={14} /> {tabLabel(page)}
                        </button>
                      ))
                    ) : (
                      <span>
                        <Check size={14} /> All supported tabs are added
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="role-tab-editor-help">
              Workspace and company tabs stay in their matching sidebar sections.
            </p>
            {section("Workspace", workspaceTabs)}
            {section("Company", companyTabs)}
          </div>
          <footer className="modal-footer">
            {admin && (
              <span className="role-tab-save-note">
                Save business settings to apply these changes.
              </span>
            )}
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setEditorOpen(false);
                setAddOpen(false);
              }}
            >
              Done arranging
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
