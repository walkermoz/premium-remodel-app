import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./mobile.module.css";

export const metadata: Metadata = {
  title: "Premium Remodel Field App",
  description:
    "Install the Premium Remodel field companion for house visits, leads, consultations, and active-shift location sharing.",
};

const iosUrl = process.env.NEXT_PUBLIC_IOS_APP_URL || "";
const androidUrl = process.env.NEXT_PUBLIC_ANDROID_APP_URL || "";

export default function MobileDownloadPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <Image
            alt=""
            height={38}
            priority
            src="/icons/app-512.png"
            width={38}
          />
          <span>
            <strong>PREMIUM</strong> REMODEL
          </span>
        </Link>
        <a className={styles.help} href="mailto:contact@premiumremodel.com">
          Need help?
        </a>
      </nav>

      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>FIELD COMPANION</p>
          <h1>The jobsite tools your team needs, in their pocket.</h1>
          <p className={styles.lead}>
            Mark houses, capture leads, schedule consultations, and share an
            active work location with the Premium Remodel team.
          </p>
          <div className={styles.downloads}>
            {iosUrl ? (
              <a className={styles.primary} href={iosUrl}>
                Download for iPhone <span>↗</span>
              </a>
            ) : (
              <span className={`${styles.primary} ${styles.pending}`}>
                iPhone TestFlight link coming soon
              </span>
            )}
            {androidUrl && (
              <a className={styles.secondary} href={androidUrl}>
                Download for Android <span>↗</span>
              </a>
            )}
          </div>
          <p className={styles.releaseNote}>
            This page is the permanent download address. The button will always
            point to the current approved build.
          </p>
        </div>

        <div
          className={styles.phoneWrap}
          aria-label="Preview of the Premium Remodel field app"
        >
          <div className={styles.phone}>
            <div className={styles.phoneTop}>
              <i />
              <i />
            </div>
            <div className={styles.appHeader}>
              <div>
                <small>PREMIUM REMODEL</small>
                <strong>Hi, Skyler</strong>
              </div>
              <span>●&nbsp; Start shift</span>
            </div>
            <div className={styles.map}>
              <div className={`${styles.road} ${styles.roadOne}`} />
              <div className={`${styles.road} ${styles.roadTwo}`} />
              <div className={`${styles.road} ${styles.roadThree}`} />
              <i className={styles.pinOne} />
              <i className={styles.pinTwo} />
              <i className={styles.pinThree} />
              <button>+ Mark house</button>
              <div className={styles.stats}>
                <span>
                  <strong>24</strong>HOUSES VISITED
                </span>
                <span>
                  <strong>6</strong>LEADS CAPTURED
                </span>
              </div>
              <div className={styles.latest}>
                <i />
                <span>
                  <small>LATEST VISIT · 2:42 PM</small>
                  <strong>1214 Willowbrook Drive</strong>
                  <em>Interested</em>
                </span>
              </div>
            </div>
            <div className={styles.tabs}>
              <span>
                ⌖<small>Map</small>
              </span>
              <span>
                ◷<small>Schedule</small>
              </span>
              <span>
                ○<small>Account</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <article>
          <span>01</span>
          <h2>Tap a house</h2>
          <p>
            Save the address, result, notes, and time so the team knows exactly
            where you have already been.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Capture the lead</h2>
          <p>
            Add the homeowner and project details at the door, then schedule
            their consultation on the company calendar.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Control your location</h2>
          <p>
            Sharing starts only when you begin a shift. Ending the shift clears
            your saved position from the company map.
          </p>
        </article>
      </section>

      <footer className={styles.footer}>
        <span>Premium Remodel Field</span>
        <span>For authorized team members</span>
      </footer>
    </main>
  );
}
