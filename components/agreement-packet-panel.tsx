"use client";

import { Check, Copy, FileSignature, Send, Tablet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgreementSignerRole } from "@/lib/agreement-template-schema";
import {
  buildSigningDataSnapshot,
  documentSigningStatusLabel,
  type DocumentSignerStatus,
  type DocumentSigningStatus,
  type SigningDocumentView,
} from "@/lib/document-signing";
import type { Quote, User } from "@/lib/types";
import DocumentSigningPanel from "./document-signing-panel";

type PublishedTemplate = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  sourceType: string;
  signerRoles: AgreementSignerRole[];
};

type SignerDraft = { roleId: string; name: string; email: string };
type PacketSummary = {
  id: string;
  template_id: string;
  template_version: number;
  status: "draft" | "sent" | "in_progress" | "completed" | "void";
  project_id: string | null;
  template_snapshot: {
    name?: string;
    deliveryMode?: "email" | "onsite";
    signerRoles?: AgreementSignerRole[];
  };
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  signers: Array<{
    role_id: string;
    role_label: string;
    party_type: "customer" | "staff" | "other";
    signing_order: number;
    name: string;
    email: string;
    status: DocumentSignerStatus;
    signed_at: string | null;
    viewed_at: string | null;
  }>;
};

const packetDocumentStatus: Record<
  PacketSummary["status"],
  DocumentSigningStatus
> = {
  draft: "draft",
  sent: "awaiting_signatures",
  in_progress: "partially_signed",
  completed: "completed",
  void: "void",
};

function agreementPacketDocument(packet: PacketSummary): SigningDocumentView {
  const status = packetDocumentStatus[packet.status];
  const roles = new Map(
    (packet.template_snapshot.signerRoles || []).map((role) => [role.id, role]),
  );
  const signed = packet.signers.filter((signer) => signer.status === "signed");
  const deliveryMode = packet.template_snapshot.deliveryMode || "email";
  return {
    id: packet.id,
    kind: "agreement",
    eyebrow: "Agreement document",
    title: packet.template_snapshot.name || "Agreement",
    versionLabel: `Version ${packet.template_version}`,
    status,
    statusLabel: documentSigningStatusLabel(status),
    statusDetail:
      status === "completed"
        ? `All ${signed.length} required signatures are complete.`
        : `${signed.length} of ${packet.signers.length} signers complete.`,
    signers: packet.signers.map((signer) => ({
      roleId: signer.role_id,
      label: signer.role_label,
      partyType: signer.party_type,
      order: signer.signing_order,
      required: roles.get(signer.role_id)?.required ?? true,
      name: signer.name,
      email: signer.email,
      status: signer.status,
      signedAt: signer.signed_at || undefined,
    })),
    delivery: packet.sent_at
      ? [
          {
            channel: deliveryMode === "onsite" ? "on_device" : "email",
            status: deliveryMode === "onsite" ? "available" : "sent",
            label:
              deliveryMode === "onsite"
                ? "Available on this device"
                : "Email sent",
            occurredAt: packet.sent_at,
          },
        ]
      : [],
  };
}

function signerDraftsForTemplate(
  template: PublishedTemplate | null,
  customerName: string,
  customerEmail: string,
  staffName: string,
  staffEmail: string,
) {
  if (!template) return [];
  return [...template.signerRoles]
    .sort((a, b) => a.order - b.order)
    .map((role) => ({
      roleId: role.id,
      name:
        role.partyType === "customer"
          ? customerName
          : role.partyType === "staff"
            ? staffName
            : "",
      email:
        role.partyType === "customer"
          ? customerEmail
          : role.partyType === "staff"
            ? staffEmail
            : "",
    }));
}

export default function AgreementPacketPanel({
  quote,
  user,
  businessName,
  demo,
  fixedTemplateId,
  heading = "Agreement packet",
  flowResponses = {},
}: {
  quote: Quote;
  user: User;
  businessName: string;
  demo: boolean;
  fixedTemplateId?: string | null;
  heading?: string;
  flowResponses?: Record<string, unknown>;
}) {
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [packets, setPackets] = useState<PacketSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<Array<{ email: string; url: string }>>([]);
  const selected = useMemo(
    () =>
      templates.find(
        (template) => template.id === (fixedTemplateId || templateId),
      ) || null,
    [fixedTemplateId, templateId, templates],
  );

  async function createPacket(deliveryMode: "email" | "onsite") {
    if (demo) return setError("Agreement delivery requires a real workspace.");
    setBusy(true);
    setError("");
    setMessage("");
    setLinks([]);
    try {
      const response = await fetch("/api/agreement-packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selected?.id || templateId,
          projectId: quote.id,
          contactId: quote.contactId || null,
          deliveryMode,
          signers: signers.filter(
            (signer) => signer.name.trim() && signer.email.trim(),
          ),
          dataSnapshot: buildSigningDataSnapshot({
            businessName,
            quote,
            user,
            custom: flowResponses,
          }),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not create agreement packet.");
      const delivered = (body.delivery || []) as Array<{
        email: string;
        status: "sent" | "failed" | "ready";
        detail?: string;
        signingUrl: string;
      }>;
      if (deliveryMode === "onsite") {
        const firstLink = delivered[0]?.signingUrl;
        if (!firstLink)
          throw new Error("Could not open the first signer’s agreement.");
        window.location.assign(firstLink);
        return;
      }
      setLinks(
        delivered.map((item) => ({
          email: item.email,
          url: item.signingUrl,
        })),
      );
      setMessage(
        delivered.every((item) => item.status === "sent")
          ? "Agreement sent to the first signer."
          : "The agreement is ready, but email could not be confirmed. Copy the private link below.",
      );
      const packetResponse = await fetch("/api/agreement-packets", {
        cache: "no-store",
      });
      const packetBody = await packetResponse.json();
      if (packetResponse.ok)
        setPackets(
          (packetBody.packets || []).filter(
            (packet: PacketSummary) =>
              packet.project_id === quote.id &&
              (!fixedTemplateId || packet.template_id === fixedTemplateId),
          ),
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create agreement packet.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/agreement-templates", {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch("/api/agreement-packets", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([templateResponse, packetResponse]) => {
        const [templateBody, packetBody] = await Promise.all([
          templateResponse.json(),
          packetResponse.json(),
        ]);
        if (!templateResponse.ok)
          throw new Error(
            templateBody.error || "Could not load agreement templates.",
          );
        if (!packetResponse.ok)
          throw new Error(
            packetBody.error || "Could not load agreement packets.",
          );
        const published = (templateBody.templates || []).filter(
          (template: PublishedTemplate) =>
            template.status === "published" &&
            template.sourceType !== "legacy_premium_msa",
        );
        setTemplates(published);
        const initial =
          published.find(
            (template: PublishedTemplate) => template.id === fixedTemplateId,
          ) || published[0];
        setTemplateId(initial?.id || "");
        setSigners(
          signerDraftsForTemplate(
            initial || null,
            quote.client,
            quote.clientEmail || "",
            user.name,
            user.email,
          ),
        );
        setPackets(
          (packetBody.packets || []).filter(
            (packet: PacketSummary) =>
              packet.project_id === quote.id &&
              (!fixedTemplateId || packet.template_id === fixedTemplateId),
          ),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load agreement templates.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    demo,
    fixedTemplateId,
    quote.client,
    quote.clientEmail,
    quote.id,
    user.email,
    user.name,
  ]);

  if (loading) return <p>Loading published agreement templates…</p>;
  if (!templates.length || (fixedTemplateId && !selected))
    return (
      <div className="alert">
        Publish an agreement template in Settings before sending agreements.
      </div>
    );

  return (
    <div className="agreement-packet-builder">
      <div className="business-panel-intro">
        <FileSignature size={22} aria-hidden="true" />
        <div>
          <h3>{heading}</h3>
          <p>
            Choose a published template, confirm every signer, and send a
            private signing link in the template’s signing order.
          </p>
        </div>
      </div>
      {!fixedTemplateId && (
        <label>
          Agreement template
          <select
            value={templateId}
            disabled={busy}
            onChange={(event) => {
              const nextTemplateId = event.target.value;
              const nextTemplate =
                templates.find((template) => template.id === nextTemplateId) ||
                null;
              setTemplateId(nextTemplateId);
              setSigners(
                signerDraftsForTemplate(
                  nextTemplate,
                  quote.client,
                  quote.clientEmail || "",
                  user.name,
                  user.email,
                ),
              );
            }}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected?.description && <p>{selected.description}</p>}
      <div className="agreement-packet-signers">
        {selected?.signerRoles
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((role, index) => (
            <fieldset key={role.id}>
              <legend>
                {role.order}. {role.label}
                {role.required ? " · Required" : " · Optional"}
              </legend>
              <label>
                Signer name
                <input
                  value={signers[index]?.name || ""}
                  required={role.required}
                  disabled={busy}
                  onChange={(event) =>
                    setSigners((current) =>
                      current.map((signer, signerIndex) =>
                        signerIndex === index
                          ? { ...signer, name: event.target.value }
                          : signer,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Signer email
                <input
                  type="email"
                  value={signers[index]?.email || ""}
                  required={role.required}
                  disabled={busy}
                  onChange={(event) =>
                    setSigners((current) =>
                      current.map((signer, signerIndex) =>
                        signerIndex === index
                          ? { ...signer, email: event.target.value }
                          : signer,
                      ),
                    )
                  }
                />
              </label>
            </fieldset>
          ))}
      </div>
      <button
        type="button"
        className="button primary"
        disabled={busy || !selected}
        onClick={() => void createPacket("email")}
      >
        <Send size={16} /> {busy ? "Preparing…" : "Create & send agreement"}
      </button>
      <button
        type="button"
        className="button secondary"
        disabled={busy || !selected}
        onClick={() => void createPacket("onsite")}
      >
        <Tablet size={16} /> Sign on this device
      </button>
      {message && (
        <p className="success">
          <Check size={15} /> {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {links.map((link) => (
        <div className="agreement-packet-link" key={link.url}>
          <span>{link.email}</span>
          <input
            value={link.url}
            readOnly
            aria-label={`Signing link for ${link.email}`}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => void navigator.clipboard.writeText(link.url)}
          >
            <Copy size={15} /> Copy link
          </button>
        </div>
      ))}
      {packets.length > 0 && (
        <div className="agreement-packet-history">
          <h4>Document history</h4>
          {packets.map((packet, index) => (
            <DocumentSigningPanel
              key={packet.id}
              document={agreementPacketDocument(packet)}
              step={index + 1}
              className="agreement-packet-history-document"
            />
          ))}
        </div>
      )}
    </div>
  );
}
