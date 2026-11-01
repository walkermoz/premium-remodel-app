"use client";

import { Check, Copy, FileSignature, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgreementSignerRole } from "@/lib/agreement-template-schema";
import type { Quote, User } from "@/lib/types";

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
  status: "draft" | "sent" | "in_progress" | "completed" | "void";
  project_id: string | null;
  template_snapshot: { name?: string };
  created_at: string;
};

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
}: {
  quote: Quote;
  user: User;
  businessName: string;
  demo: boolean;
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
    () => templates.find((template) => template.id === templateId) || null,
    [templateId, templates],
  );

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
          throw new Error(packetBody.error || "Could not load agreement packets.");
        const published = (templateBody.templates || []).filter(
          (template: PublishedTemplate) =>
            template.status === "published" &&
            template.sourceType !== "legacy_premium_msa",
        );
        setTemplates(published);
        setTemplateId(published[0]?.id || "");
        setSigners(
          signerDraftsForTemplate(
            published[0] || null,
            quote.client,
            quote.clientEmail || "",
            user.name,
            user.email,
          ),
        );
        setPackets(
          (packetBody.packets || []).filter(
            (packet: PacketSummary) => packet.project_id === quote.id,
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
    quote.client,
    quote.clientEmail,
    quote.id,
    user.email,
    user.name,
  ]);

  if (loading) return <p>Loading published agreement templates…</p>;
  if (!templates.length)
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
          <h3>Agreement packet</h3>
          <p>
            Choose a published template, confirm every signer, and send a
            private signing link in the template’s signing order.
          </p>
        </div>
      </div>
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
        disabled={busy || !templateId}
        onClick={async () => {
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
                templateId,
                projectId: quote.id,
                contactId: quote.contactId || null,
                signers: signers.filter(
                  (signer) => signer.name.trim() && signer.email.trim(),
                ),
                dataSnapshot: {
                  organization: { name: businessName },
                  contact: {
                    id: quote.contactId || null,
                    name: quote.client,
                    email: quote.clientEmail || "",
                    phone: quote.clientPhone || "",
                    address: quote.address,
                  },
                  quote,
                },
              }),
            });
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error || "Could not create agreement packet.");
            const delivered = (body.delivery || []) as Array<{
              email: string;
              status: string;
              detail?: string;
              signingUrl: string;
            }>;
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
                  (packet: PacketSummary) => packet.project_id === quote.id,
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
        }}
      >
        <Send size={16} /> {busy ? "Preparing…" : "Create & send agreement"}
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
          <input value={link.url} readOnly aria-label={`Signing link for ${link.email}`} />
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
          <h4>Agreement history</h4>
          {packets.map((packet) => (
            <div key={packet.id}>
              <strong>{packet.template_snapshot.name || "Agreement"}</strong>
              <span>{packet.status.replaceAll("_", " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
