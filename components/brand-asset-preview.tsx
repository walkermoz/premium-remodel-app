"use client";

import { useEffect, useRef } from "react";
import type { BusinessConfig } from "@/lib/business-config";

export type BrandPreviewKind = "logo" | "logo-dark" | "logo-mark" | "banner";

const previewTitles: Record<BrandPreviewKind, string> = {
  logo: "Primary logo",
  "logo-dark": "White / reversed logo",
  "logo-mark": "Square mark",
  banner: "Client portal banner",
};

export default function BrandAssetPreview({
  kind,
  profile,
  previewUrl,
  onClose,
}: {
  kind: BrandPreviewKind;
  profile: BusinessConfig["profile"];
  previewUrl: (url: string) => string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const primaryLogo = profile.logoUrl ? previewUrl(profile.logoUrl) : "";
  const reversedLogo = profile.logoDarkUrl
    ? previewUrl(profile.logoDarkUrl)
    : primaryLogo;
  const mark = profile.logoMarkUrl ? previewUrl(profile.logoMarkUrl) : "";
  const banner = profile.bannerUrl ? previewUrl(profile.bannerUrl) : "";

  function logo(src: string) {
    return src ? (
      <img src={src} alt={profile.name} />
    ) : (
      <strong>{profile.name}</strong>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="brand-context-dialog"
      aria-labelledby="brand-context-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="brand-context-content">
        <header className="brand-context-header">
          <div>
            <span>Brand placement</span>
            <h2 id="brand-context-title">{previewTitles[kind]}</h2>
          </div>
          <button
            type="button"
            className="brand-context-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close preview"
          >
            ×
          </button>
        </header>

        {kind === "logo" && (
          <div className="brand-context-scenes">
            <section>
              <h3>Workspace navigation · light theme</h3>
              <div className="brand-context-workspace light">
                <div className="brand-context-workspace-logo">
                  {logo(primaryLogo)}
                </div>
                <div className="brand-context-switcher">
                  <span className="brand-context-mark">
                    {mark ? <img src={mark} alt="" /> : profile.name.charAt(0)}
                  </span>
                  <span>{profile.name}</span>
                  <span aria-hidden="true">⌄</span>
                </div>
                <div className="brand-context-nav">Overview</div>
                <div className="brand-context-nav">Projects</div>
              </div>
            </section>
            <section>
              <h3>Quote email</h3>
              <div className="brand-context-email">
                <div className="brand-context-email-logo">
                  {logo(primaryLogo)}
                </div>
                <div className="brand-context-email-body">
                  <strong>Your project quote</strong>
                  <p>Your quote is ready to review.</p>
                  <span>View your quote in the portal</span>
                </div>
              </div>
            </section>
            <p className="brand-context-note">
              The primary logo also appears on the client quote and its PDF.
            </p>
          </div>
        )}

        {kind === "logo-dark" && (
          <div className="brand-context-scenes">
            <section>
              <h3>Workspace navigation · dark theme</h3>
              <div className="brand-context-workspace dark">
                <div className="brand-context-workspace-logo">
                  {logo(reversedLogo)}
                </div>
                <div className="brand-context-switcher">
                  <span className="brand-context-mark">
                    {mark ? <img src={mark} alt="" /> : profile.name.charAt(0)}
                  </span>
                  <span>{profile.name}</span>
                  <span aria-hidden="true">⌄</span>
                </div>
                <div className="brand-context-nav">Overview</div>
                <div className="brand-context-nav">Projects</div>
              </div>
            </section>
            {!profile.logoDarkUrl && (
              <p className="brand-context-note">
                No reversed logo is uploaded yet. The workspace currently uses
                the primary logo here.
              </p>
            )}
          </div>
        )}

        {kind === "logo-mark" && (
          <div className="brand-context-scenes">
            <section>
              <h3>Workspace switcher</h3>
              <div className="brand-context-workspace dark">
                <div className="brand-context-workspace-logo">
                  {logo(reversedLogo)}
                </div>
                <div className="brand-context-switcher">
                  <span className="brand-context-mark">
                    {mark ? <img src={mark} alt="" /> : profile.name.charAt(0)}
                  </span>
                  <span>{profile.name}</span>
                  <span aria-hidden="true">⌄</span>
                </div>
                <div className="brand-context-nav">Overview</div>
                <div className="brand-context-nav">Projects</div>
              </div>
            </section>
            <p className="brand-context-note">
              {mark
                ? "The square mark appears beside your business name."
                : "No square mark is uploaded yet. The switcher currently uses the business initial."}
            </p>
          </div>
        )}

        {kind === "banner" && (
          <div className="brand-context-scenes">
            <section>
              <h3>Client portal · quote page</h3>
              <div className="brand-context-portal">
                <div className="brand-context-portal-nav">{profile.name}</div>
                <div className="brand-context-portal-main">
                  {banner && (
                    <img className="brand-context-banner" src={banner} alt="" />
                  )}
                  <div className="brand-context-portal-toolbar">
                    <span>{profile.name} · Quote #1001</span>
                    <span>Download PDF</span>
                  </div>
                  <div className="brand-context-portal-paper">
                    <strong>Project quote</strong>
                    <p>Prepared for your client</p>
                  </div>
                </div>
              </div>
            </section>
            {!banner && (
              <p className="brand-context-note">
                No banner is uploaded yet. The portal currently starts with the
                quote toolbar.
              </p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
