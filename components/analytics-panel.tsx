"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  MessageSquareText,
  RefreshCw,
  Star,
} from "lucide-react";
import type {
  GoogleBusinessLocation,
  GoogleBusinessReview,
  GoogleBusinessReviewsPage,
  GoogleBusinessStatus,
} from "@/lib/google-business-types";

const sampleStatus: GoogleBusinessStatus = {
  configured: true,
  connected: true,
  email: "preview@example.com",
  locationName: "locations/sample",
  locationTitle: "Sample business location",
  canManage: true,
};
const sampleReviews: GoogleBusinessReviewsPage = {
  reviews: [
    {
      id: "sample",
      name: "sample",
      reviewer: "Sample customer",
      rating: 5,
      comment: "This preview shows how a new Google review will appear here.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reply: null,
      replyUpdatedAt: null,
      replyUrl: null,
    },
  ],
  averageRating: 5,
  totalReviewCount: 1,
  nextPageToken: null,
  fetchedAt: new Date().toISOString(),
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Could not load Google reviews.");
  return body as T;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

export default function AnalyticsPanel({
  demo,
  canManage,
}: {
  demo: boolean;
  canManage: boolean;
}) {
  const [status, setStatus] = useState<GoogleBusinessStatus | null>(
    demo ? sampleStatus : null,
  );
  const [locations, setLocations] = useState<GoogleBusinessLocation[]>([]);
  const [locationValue, setLocationValue] = useState("");
  const [page, setPage] = useState<GoogleBusinessReviewsPage | null>(
    demo ? sampleReviews : null,
  );
  const [reviews, setReviews] = useState<GoogleBusinessReview[]>(
    demo ? sampleReviews.reviews : [],
  );
  const [filter, setFilter] = useState<"all" | "unanswered" | "replied">("all");
  const [loading, setLoading] = useState(!demo);
  const [refreshing, setRefreshing] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [replyingId, setReplyingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newIds, setNewIds] = useState<string[]>([]);
  const knownIds = useRef<Set<string> | null>(null);
  const fetching = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setError("");
    try {
      const next = await jsonResponse<GoogleBusinessStatus>(
        await fetch("/api/google-business", { cache: "no-store" }),
      );
      setStatus(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not check Google connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [demo]);

  const refreshReviews = useCallback(async () => {
    if (demo || fetching.current) return;
    fetching.current = true;
    setRefreshing(true);
    try {
      const next = await jsonResponse<GoogleBusinessReviewsPage>(
        await fetch("/api/google-business/reviews", { cache: "no-store" }),
      );
      setReviews(next.reviews);
      setPage(next);
      if (knownIds.current) {
        const arrivals = next.reviews
          .filter((review) => !knownIds.current?.has(review.name))
          .map((review) => review.name);
        if (arrivals.length)
          setNewIds((current) => [...new Set([...current, ...arrivals])]);
      }
      knownIds.current = new Set(next.reviews.map((review) => review.name));
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh Google reviews.",
      );
    } finally {
      fetching.current = false;
      setRefreshing(false);
    }
  }, [demo]);

  const loadLocations = useCallback(async () => {
    if (demo || !canManage) return;
    setLocationsLoading(true);
    setError("");
    try {
      const result = await jsonResponse<{
        locations: GoogleBusinessLocation[];
      }>(await fetch("/api/google-business/locations", { cache: "no-store" }));
      setLocations(result.locations);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not find Google locations.",
      );
    } finally {
      setLocationsLoading(false);
    }
  }, [canManage, demo]);

  useEffect(() => {
    if (demo) return;
    const timer = window.setTimeout(() => {
      const result = new URLSearchParams(window.location.search).get(
        "googleBusiness",
      );
      if (result === "connected")
        setNotice(
          "Google account connected. Choose the business location to monitor.",
        );
      if (result === "denied") setError("Google access was not granted.");
      if (result === "expired")
        setError("The Google connection expired. Try again.");
      if (result === "error")
        setError(
          "Google could not complete the connection. Check API access and try again.",
        );
      void refreshStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [demo, refreshStatus]);

  useEffect(() => {
    if (!status?.connected || status.locationName) return;
    const timer = window.setTimeout(() => void loadLocations(), 0);
    return () => window.clearTimeout(timer);
  }, [status?.connected, status?.locationName, loadLocations]);

  useEffect(() => {
    if (!status?.locationName || demo) return;
    const initial = window.setTimeout(() => void refreshReviews(), 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshReviews();
    }, 5 * 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [status?.locationName, demo, refreshReviews]);

  async function saveLocation() {
    if (!locationValue || savingLocation) return;
    const selected = locations.find(
      (location) =>
        `${location.accountName}|${location.locationName}` === locationValue,
    );
    if (!selected) return;
    setSavingLocation(true);
    setError("");
    try {
      await jsonResponse(
        await fetch("/api/google-business/locations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selected),
        }),
      );
      setNotice(`Now showing reviews for ${selected.title}.`);
      await refreshStatus();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not choose that location.",
      );
    } finally {
      setSavingLocation(false);
    }
  }

  async function loadOlder() {
    if (!page?.nextPageToken) return;
    setRefreshing(true);
    try {
      const older = await jsonResponse<GoogleBusinessReviewsPage>(
        await fetch(
          `/api/google-business/reviews?pageToken=${encodeURIComponent(page.nextPageToken)}`,
          { cache: "no-store" },
        ),
      );
      setReviews((current) => {
        const seen = new Set(current.map((review) => review.name));
        return [
          ...current,
          ...older.reviews.filter((review) => !seen.has(review.name)),
        ];
      });
      setPage(older);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load older reviews.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function postReply(review: GoogleBusinessReview) {
    if (demo) {
      setNotice(
        "This is a preview. Connect Google Business Profile to post a reply.",
      );
      return;
    }
    if (!draft.trim() || replyingId) return;
    setReplyingId(review.id);
    setError("");
    try {
      const result = await jsonResponse<{
        comment: string;
        updatedAt: string | null;
      }>(
        await fetch("/api/google-business/replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewId: review.id, comment: draft }),
        }),
      );
      setReviews((current) =>
        current.map((item) =>
          item.name === review.name
            ? {
                ...item,
                reply: result.comment,
                replyUpdatedAt: result.updatedAt,
              }
            : item,
        ),
      );
      setEditingId("");
      setDraft("");
      setNotice("Your reply was sent to Google.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not post the reply.",
      );
    } finally {
      setReplyingId("");
    }
  }

  const unanswered = reviews.filter((review) => !review.reply).length;
  const filtered = reviews.filter((review) =>
    filter === "all"
      ? true
      : filter === "unanswered"
        ? !review.reply
        : !!review.reply,
  );

  return (
    <div className="analytics-panel">
      <div className="page-heading analytics-heading">
        <div>
          <span className="eyebrow">CUSTOMER FEEDBACK</span>
          <h1>
            Analytics<span className="heading-dot">.</span>
          </h1>
          <p>See your Google reviews and respond from one place.</p>
        </div>
        {status?.locationName && !demo && (
          <button
            className="button secondary"
            type="button"
            onClick={() => void refreshReviews()}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            Refresh reviews
          </button>
        )}
      </div>

      {demo && (
        <p className="analytics-preview-note">
          Preview data — connect a real Google Business Profile in your
          workspace.
        </p>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-note" role="status">
          {notice}
        </div>
      )}

      {loading && !status && (
        <p className="analytics-muted">Checking Google Business Profile…</p>
      )}

      {status && !status.connected && (
        <section className="analytics-connect">
          <span className="analytics-kicker">GOOGLE BUSINESS PROFILE</span>
          <div className="analytics-connect-icon">
            <ChartNoAxesCombined size={25} />
          </div>
          <h2>Bring your reviews into Analytics</h2>
          <p>
            Connect the Google account that manages your verified business
            listing. Reviews will appear here, and authorized staff can reply
            directly.
          </p>
          {canManage ? (
            status.configured ? (
              <a className="button primary" href="/api/google-business/connect">
                Connect Google Business Profile
              </a>
            ) : (
              <p className="analytics-setup-note">
                Platform setup is needed: enable the Google Business Profile
                APIs and add the OAuth connection credentials.
              </p>
            )
          ) : (
            <p className="analytics-setup-note">
              Ask an organization administrator to connect the business listing.
            </p>
          )}
        </section>
      )}

      {status?.connected && !status.locationName && (
        <section className="analytics-connect">
          <span className="analytics-kicker">
            CONNECTED AS {status.email || "GOOGLE ACCOUNT"}
          </span>
          <h2>Choose the location to monitor</h2>
          <p>
            Select the verified business listing whose reviews should appear
            here.
          </p>
          {canManage ? (
            <>
              {locationsLoading && (
                <p className="analytics-muted">
                  Finding your Google locations…
                </p>
              )}
              {!locationsLoading && locations.length === 0 && (
                <p className="analytics-setup-note">
                  No locations found. Check that this Google account manages a
                  verified business listing and that the Business Profile APIs
                  are approved.
                </p>
              )}
              {locations.length > 0 && (
                <div className="analytics-location-controls">
                  <select
                    aria-label="Google business location"
                    value={locationValue}
                    onChange={(event) => setLocationValue(event.target.value)}
                  >
                    <option value="">Select a location</option>
                    {locations.map((location) => (
                      <option
                        key={`${location.accountName}|${location.locationName}`}
                        value={`${location.accountName}|${location.locationName}`}
                      >
                        {location.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!locationValue || savingLocation}
                    onClick={() => void saveLocation()}
                  >
                    {savingLocation ? "Saving…" : "Show reviews"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="analytics-setup-note">
              An organization administrator needs to choose the location.
            </p>
          )}
        </section>
      )}

      {status?.locationName && (
        <>
          <div className="analytics-summary">
            <div className="analytics-score">
              <span className="analytics-kicker">GOOGLE REVIEWS</span>
              <strong>{page?.averageRating?.toFixed(1) || "—"}</strong>
              <span
                className="analytics-stars"
                aria-label={`${page?.averageRating || 0} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={18}
                    fill={
                      index < Math.round(page?.averageRating || 0)
                        ? "currentColor"
                        : "none"
                    }
                  />
                ))}
              </span>
              <small>{page?.totalReviewCount ?? "—"} total reviews</small>
            </div>
            <div className="analytics-summary-main">
              <div className="analytics-summary-icon">
                <MessageSquareText size={20} />
              </div>
              <span className="analytics-kicker">YOUR LOCATION</span>
              <h2>{status.locationTitle || "Google business location"}</h2>
              <p>
                Recent reviews refresh every five minutes while this page is
                open.
              </p>
              <div className="analytics-summary-stats">
                <span>
                  <strong>{unanswered}</strong> shown need a reply
                </span>
                <span>
                  <strong>{reviews.length}</strong> shown on this page
                </span>
              </div>
            </div>
          </div>

          <div className="analytics-feed-heading">
            <div>
              <span className="analytics-kicker">LATEST FEEDBACK</span>
              <h2>Reviews</h2>
            </div>
            <div
              className="analytics-filters"
              role="group"
              aria-label="Filter reviews"
            >
              {(["all", "unanswered", "replied"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={filter === option ? "active" : ""}
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option === "all"
                    ? "All"
                    : option === "unanswered"
                      ? "Needs reply"
                      : "Replied"}
                </button>
              ))}
            </div>
          </div>
          {page && !filtered.length && (
            <div className="analytics-empty">
              <Check size={22} />
              <strong>
                {filter === "unanswered"
                  ? "All caught up"
                  : "No reviews in this view"}
              </strong>
              <p>
                {filter === "unanswered"
                  ? "Every loaded review has a reply."
                  : "Try another filter or refresh your Google reviews."}
              </p>
            </div>
          )}
          {!page && <p className="analytics-muted">Loading reviews…</p>}
          <div className="analytics-reviews">
            {filtered.map((review) => (
              <article className="analytics-review" key={review.name}>
                <div className="analytics-review-head">
                  <div className="analytics-review-avatar" aria-hidden="true">
                    {review.reviewer.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="analytics-review-identity">
                    <strong>{review.reviewer}</strong>
                    <span>{dateLabel(review.createdAt)}</span>
                  </div>
                  {newIds.includes(review.name) && (
                    <span className="analytics-new">New</span>
                  )}
                  <div
                    className="analytics-review-rating"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        key={index}
                        size={15}
                        fill={index < review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                </div>
                <p className="analytics-review-copy">
                  {review.comment || "Star rating without a written review."}
                </p>
                {review.reply && editingId !== review.id && (
                  <div className="analytics-reply-existing">
                    <span>
                      YOUR REPLY{" "}
                      {review.replyUpdatedAt
                        ? `· ${dateLabel(review.replyUpdatedAt)}`
                        : ""}
                    </span>
                    <p>{review.reply}</p>
                  </div>
                )}
                {editingId === review.id ? (
                  <div className="analytics-reply-editor">
                    <label htmlFor={`review-reply-${review.id}`}>
                      {review.reply
                        ? "Edit your reply"
                        : "Write a public reply"}
                    </label>
                    <textarea
                      id={`review-reply-${review.id}`}
                      rows={3}
                      maxLength={4096}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Thank the customer or respond to their feedback…"
                    />
                    <div className="analytics-reply-actions">
                      <span>Your reply will be visible on Google.</span>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setEditingId("");
                          setDraft("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        disabled={!draft.trim() || !!replyingId}
                        onClick={() => void postReply(review)}
                      >
                        {replyingId === review.id
                          ? "Posting…"
                          : review.reply
                            ? "Save reply"
                            : "Post reply"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="analytics-review-actions">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(review.id);
                          setDraft(review.reply || "");
                        }}
                      >
                        <MessageSquareText size={14} />{" "}
                        {review.reply ? "Edit reply" : "Reply"}
                      </button>
                    )}
                    {review.replyUrl && (
                      <a
                        href={review.replyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Google <ArrowUpRight size={13} />
                      </a>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          {page?.nextPageToken && (
            <button
              className="button secondary analytics-more"
              type="button"
              onClick={() => void loadOlder()}
              disabled={refreshing}
            >
              Load older reviews
            </button>
          )}
          {page && (
            <p className="analytics-fetched">
              Updated {dateLabel(page.fetchedAt)} · Google Business Profile
            </p>
          )}
        </>
      )}
    </div>
  );
}
