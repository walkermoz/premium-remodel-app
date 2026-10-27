"use client";
import { useState, useEffect } from "react";
import {
  UserPlus,
  Copy,
  Check,
  Trash2,
  ShieldCheck,
  Users,
  MessageSquare,
  Camera,
} from "lucide-react";
import type { User } from "@/lib/types";
import { Avatar, Modal } from "./ui";

const groupLabels = {
  owner: "Administrator",
  admin: "Administrator",
  office: "Office",
  crew: "Crew",
  field: "Field",
  doorknocker: "Door knocker",
} as const;

export default function TeamPanel({
  user,
  demo,
  notify,
  twilioEnabled = false,
}: {
  user: User;
  demo: boolean;
  notify: (message: string, error?: boolean) => void;
  twilioEnabled?: boolean;
}) {
  const [members, setMembers] = useState<User[]>([user]);
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showAppInstructions, setShowAppInstructions] = useState(false);
  const [appPhone, setAppPhone] = useState("");
  const [appLinkError, setAppLinkError] = useState("");
  const [appLinkSentTo, setAppLinkSentTo] = useState("");
  const [sendingAppLink, setSendingAppLink] = useState(false);
  const [remove, setRemove] = useState<User | null>(null);
  const [photoMember, setPhotoMember] = useState<User | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  useEffect(() => {
    if (!demo)
      fetch("/api/auth")
        .then((r) => r.json())
        .then((data) => {
          if (data.members) setMembers(data.members);
          else setError(data.error || "Could not load the team.");
        })
        .catch(() => setError("Could not load the team."));
  }, [demo]);
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (demo) {
      setError(
        "Sign in to your real workspace to invite your team. Sample mode does not send invitations.",
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLink(data.url || "");
      if (data.delivery === "email") setSentTo(data.email);
      const team = await fetch("/api/auth").then((r) => r.json());
      if (team.members) setMembers(team.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite.");
    } finally {
      setBusy(false);
    }
  }
  async function sendAppLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppLinkError("");
    if (demo) {
      setAppLinkError(
        "Sign in to your real workspace to send a text message. Sample mode does not contact Twilio.",
      );
      return;
    }
    setSendingAppLink(true);
    try {
      const response = await fetch("/api/twilio/install-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: appPhone }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not send the app link.");
      setAppLinkSentTo(appPhone.trim());
      notify("App link sent");
    } catch (e) {
      setAppLinkError(
        e instanceof Error ? e.message : "Could not send the app link.",
      );
    } finally {
      setSendingAppLink(false);
    }
  }
  async function uploadPhoto(file: File, member: User) {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.set("memberId", member.id);
      form.set("file", file);
      const response = await fetch("/api/team-photos", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save photo.");
      const updated = { ...member, photoUrl: data.photoUrl as string };
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? updated : item)),
      );
      setPhotoMember(updated);
      notify("Profile photo saved");
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Could not save photo.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  async function removePhoto(member: User) {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const response = await fetch("/api/team-photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not remove photo.");
      const updated = { ...member, photoUrl: undefined };
      setMembers((current) =>
        current.map((item) => (item.id === member.id ? updated : item)),
      );
      setPhotoMember(updated);
      notify("Profile photo removed");
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Could not remove photo.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading team-page-heading">
        <div>
          <span className="eyebrow">YOUR PEOPLE</span>
          <h1>
            Company team<span className="heading-dot">.</span>
          </h1>
          <p>One shared workspace for the people behind your projects.</p>
        </div>
        {user.role === "admin" && (
          <div className="page-heading-actions">
            {twilioEnabled && (
              <button
                className="button secondary"
                onClick={() => {
                  setShowAppInstructions(true);
                  setAppPhone("");
                  setAppLinkError("");
                  setAppLinkSentTo("");
                }}
              >
                <MessageSquare size={17} />
                Send app link
              </button>
            )}
            <button
              className="button primary"
              onClick={() => {
                setShowInvite(true);
                setError("");
                setLink("");
                setSentTo("");
                setCopied(false);
              }}
            >
              <UserPlus size={17} />
              Invite teammate
            </button>
          </div>
        )}
      </div>
      <div className="section-intro">
        <Users size={19} />
        <h2>Workspace members</h2>
        <span className="count-pill">{members.length}</span>
      </div>
      <div className="members-list">
        {members.map((member) => (
          <div className="member-row" key={member.id}>
            {user.role === "admin" || member.id === user.id ? (
              <button
                type="button"
                className="member-photo-button"
                aria-label={`Change profile photo for ${member.name}`}
                title={`Change profile photo for ${member.name}`}
                onClick={() => {
                  setPhotoMember(member);
                  setPhotoError("");
                }}
              >
                <Avatar name={member.name} photoUrl={member.photoUrl} />
                <Camera size={12} aria-hidden="true" />
              </button>
            ) : (
              <Avatar name={member.name} photoUrl={member.photoUrl} />
            )}
            <div className="member-info">
              <strong>
                {member.name}
                {member.id === user.id && <span className="muted"> (you)</span>}
              </strong>
              <span>{member.email}</span>
            </div>
            <span className="member-role">
              {member.role === "admin" && <ShieldCheck size={15} />}{" "}
              {groupLabels[member.group]}
            </span>
            {user.role === "admin" && member.role !== "admin" && (
              <button
                className="icon-button delete-action"
                aria-label={`Remove ${member.name}`}
                onClick={() => setRemove(member)}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="footnote">
        Team members can manage all company projects, tasks, contractors, and
        updates. The administrator also manages access and file deletion.
      </p>
      {error && !showInvite && <div className="alert">{error}</div>}
      {photoMember && (
        <Modal
          title="Profile photo"
          subtitle={photoMember.name}
          onClose={() => !photoBusy && setPhotoMember(null)}
        >
          <div className="member-photo-editor">
            <Avatar name={photoMember.name} photoUrl={photoMember.photoUrl} />
            <p>
              Use a clear JPG, PNG, or WebP photo up to 4 MB. It will be cropped
              to a square.
            </p>
            {photoError && (
              <div className="alert" role="alert">
                {photoError}
              </div>
            )}
          </div>
          <footer className="modal-footer">
            {photoMember.photoUrl && (
              <button
                type="button"
                className="button secondary"
                disabled={photoBusy}
                onClick={() => removePhoto(photoMember)}
              >
                Remove photo
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={photoBusy}
              onClick={() => setPhotoMember(null)}
            >
              Close
            </button>
            <label
              className={`button primary member-photo-upload ${photoBusy ? "disabled" : ""}`}
            >
              <Camera size={16} /> {photoBusy ? "Saving…" : "Choose photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={photoBusy || demo}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) uploadPhoto(file, photoMember);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </footer>
        </Modal>
      )}
      {showInvite && (
        <Modal
          title="Invite a teammate"
          subtitle="Invite them to your shared company workspace."
          onClose={() => setShowInvite(false)}
        >
          <form onSubmit={invite} className="entity-form">
            <div className="form-fields">
              {!link && !sentTo ? (
                <>
                  <label>
                    Work email
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="teammate@premiumremodel.com"
                    />
                  </label>
                  <label>
                    Team group
                    <select name="group" defaultValue="office">
                      <option value="office">Office</option>
                      <option value="crew">Crew</option>
                      <option value="field">Field</option>
                      <option value="doorknocker">Door knocker</option>
                    </select>
                  </label>
                  <label>
                    Invitation delivery
                    <select name="method" defaultValue="email">
                      <option value="email">Send an email</option>
                      <option value="link">Create a link to share</option>
                    </select>
                  </label>
                </>
              ) : sentTo ? (
                <div className="success-note" role="status">
                  <Check size={17} /> Invitation email sent to {sentTo}
                </div>
              ) : (
                <>
                  <div className="success-note">
                    <Check size={17} />
                    Invitation link created
                  </div>
                  <label>
                    Share this link with your teammate
                    <input
                      value={link}
                      readOnly
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <p className="footnote">
                    Share this private, single-use link only with your teammate.
                    Its expiration is controlled by your company’s sign-in
                    settings. No email has been sent.
                  </p>
                </>
              )}
              {error && <div className="alert">{error}</div>}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowInvite(false)}
              >
                Close
              </button>
              {!link && !sentTo ? (
                <button className="button primary" disabled={busy}>
                  {busy ? "Inviting…" : "Invite teammate"}
                </button>
              ) : link ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                    } catch {
                      setError("Select and copy the link above.");
                    }
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                  {copied ? "Copied" : "Copy link"}
                </button>
              ) : null}
            </footer>
          </form>
        </Modal>
      )}
      {twilioEnabled && showAppInstructions && (
        <Modal
          title="Text the Premium Remodel app link"
          subtitle="Twilio sends the install link and phone setup steps directly to your teammate."
          onClose={() => setShowAppInstructions(false)}
        >
          <form className="entity-form" onSubmit={sendAppLink}>
            <div className="form-fields">
              {appLinkSentTo ? (
                <div className="success-note" role="status">
                  <Check size={17} /> App link sent to {appLinkSentTo}
                </div>
              ) : (
                <label>
                  Teammate phone number
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="(919) 555-0123"
                    value={appPhone}
                    onChange={(event) => setAppPhone(event.target.value)}
                  />
                </label>
              )}
              {!appLinkSentTo && (
                <p className="footnote">
                  Sent from Premium Remodel’s Twilio number. Standard messaging
                  rates may apply.
                </p>
              )}
              {appLinkError && (
                <div className="alert" role="alert">
                  {appLinkError}
                </div>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowAppInstructions(false)}
              >
                Close
              </button>
              {!appLinkSentTo && (
                <button className="button primary" disabled={sendingAppLink}>
                  <MessageSquare size={15} />
                  {sendingAppLink ? "Sending…" : "Send link"}
                </button>
              )}
            </footer>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title={`Remove ${remove.name}?`}
          subtitle="Their access ends immediately. Project records and comments remain."
          onClose={() => setRemove(null)}
        >
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await fetch("/api/auth", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: remove.id }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setMembers((m) => m.filter((u) => u.id !== remove.id));
                  setRemove(null);
                  notify("Team member removed");
                } catch (e) {
                  notify(
                    e instanceof Error ? e.message : "Could not remove member",
                    true,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove access
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
