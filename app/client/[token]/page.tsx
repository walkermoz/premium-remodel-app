import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Check, MapPin } from "lucide-react";
import { readClientPortal, type ClientPortalTask } from "@/lib/client-portal";
import styles from "./portal.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Project update | Premium Remodel",
  description: "A private Premium Remodel project update.",
  robots: { index: false, follow: false, noarchive: true },
};

function dateLabel(value?: string) {
  if (!value) return "To be scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function updateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function timeLabel(value?: string) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hours, minutes)));
}

function taskType(task: ClientPortalTask) {
  return task.workType || "Task";
}

export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const portal = await readClientPortal(token);
  if (!portal) notFound();

  const { project, completed, upcoming, latestUpdate } = portal;
  const nextTask = upcoming[0];
  const laterTasks = upcoming.slice(1);
  const isCompleted = project.status === "Completed";

  return (
    <main className={styles.portal}>
      <header className={styles.hero}>
        <div className={styles.heroNav}>
          <img src="/images/logo.png" alt="Premium Remodel" />
          <div className={styles.heroNavMeta}>
            <strong>Project update</strong>
            <span>Updated {updateLabel(latestUpdate)}</span>
          </div>
        </div>
        <div className={styles.heroContent}>
          <div
            className={`${styles.heroLead} ${!isCompleted && !nextTask ? styles.heroLeadSingle : ""}`}
          >
            <div className={styles.heroTitle}>
              <div className={styles.heroStatus}>
                <span
                  className={`${styles.status} ${styles[project.status.toLowerCase().replaceAll(" ", "")]}`}
                >
                  {project.status}
                </span>
              </div>
              <h1>{project.name}</h1>
              <p className={styles.location}>
                <MapPin size={16} aria-hidden="true" />
                {project.address || "Project location"}
              </p>
            </div>
            {isCompleted ? (
              <section className={styles.completeFeature}>
                <span className={styles.featureIcon}>
                  <Check size={22} aria-hidden="true" />
                </span>
                <div>
                  <p className={styles.eyebrow}>Project complete</p>
                  <h2>Finished with care.</h2>
                  <p>The scheduled work for this project has been completed.</p>
                </div>
              </section>
            ) : nextTask ? (
              <section
                className={styles.nextFeature}
                aria-labelledby="next-title"
              >
                <div className={styles.featureHeading}>
                  <div>
                    <p className={styles.eyebrow}>Up next</p>
                    <h2 id="next-title">What’s next</h2>
                  </div>
                  <span className={styles.sequence}>01</span>
                </div>
                <div className={styles.featuredTask}>
                  <div className={styles.taskLabels}>
                    <span className={styles.taskType}>
                      {taskType(nextTask)}
                    </span>
                    {nextTask.status === "In progress" && (
                      <span className={styles.live}>In progress</span>
                    )}
                  </div>
                  <h3>{nextTask.title}</h3>
                  <time dateTime={nextTask.dueDate || undefined}>
                    <CalendarDays size={17} aria-hidden="true" />
                    <span>
                      {dateLabel(nextTask.dueDate)}
                      {nextTask.startTime && (
                        <small>{timeLabel(nextTask.startTime)}</small>
                      )}
                    </span>
                  </time>
                </div>
              </section>
            ) : null}
          </div>
          <div className={styles.heroDetails}>
            <div className={styles.heroBrief}>
              <p className={styles.eyebrow}>
                {isCompleted ? "What we built" : "What we’re building"}
              </p>
              <p>
                {project.description ||
                  "Project details will appear here as the plan takes shape."}
              </p>
            </div>
            <dl className={styles.heroDates}>
              <div>
                <dt>Project start</dt>
                <dd>{dateLabel(project.startDate)}</dd>
              </div>
              <div>
                <dt>Target finish</dt>
                <dd>{dateLabel(project.endDate)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        {!isCompleted && laterTasks.length > 0 && (
          <section className={styles.workSection} aria-labelledby="later-title">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>On the schedule</p>
              <h2 id="later-title">After that</h2>
              <p>
                The work that follows, shown in the order it’s currently
                planned.
              </p>
              <span className={styles.nextCount}>
                {laterTasks.length} more scheduled{" "}
                {laterTasks.length === 1 ? "item" : "items"}
              </span>
            </div>
            <ol className={styles.upcomingList}>
              {laterTasks.map((task, index) => (
                <li key={task.id}>
                  <span className={styles.sequence}>
                    {String(index + 2).padStart(2, "0")}
                  </span>
                  <div className={styles.taskBody}>
                    <div>
                      <span className={styles.taskType}>{taskType(task)}</span>
                      {task.status === "In progress" && (
                        <span className={styles.live}>In progress</span>
                      )}
                    </div>
                    <h3>{task.title}</h3>
                  </div>
                  <time
                    className={styles.taskDate}
                    dateTime={task.dueDate || undefined}
                  >
                    <CalendarDays size={15} aria-hidden="true" />
                    <span>
                      {dateLabel(task.dueDate)}
                      {task.startTime && (
                        <small>{timeLabel(task.startTime)}</small>
                      )}
                    </span>
                  </time>
                </li>
              ))}
            </ol>
          </section>
        )}

        {completed.length > 0 && (
          <section
            className={`${styles.workSection} ${styles.completedSection}`}
            aria-labelledby="complete-title"
          >
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Finished</p>
              <h2 id="complete-title">What’s been done</h2>
              <p>Recently completed work, newest first.</p>
            </div>
            <ol className={styles.completedList}>
              {completed.map((task) => (
                <li key={task.id}>
                  <span className={styles.completeIcon}>
                    <Check size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <span>{taskType(task)}</span>
                    <h3>{task.title}</h3>
                  </div>
                  <time dateTime={task.completion?.at || task.updatedAt}>
                    {updateLabel(task.completion?.at || task.updatedAt)}
                  </time>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
