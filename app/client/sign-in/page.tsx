import type { Metadata } from "next";
import SignInForm from "./sign-in-form";
import styles from "./sign-in.module.css";

export const metadata: Metadata = {
  title: "Client portal sign-in",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function ClientSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; org?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <strong>Client portal</strong>
        </header>
        <div className={styles.body}>
          <p className={styles.eyebrow}>CLIENT PORTAL</p>
          <h1>Sign in with your email</h1>
          <p className={styles.intro}>
            Enter the email address on your quote. We’ll send you a private link
            to open your portal on this device.
          </p>
          {query.expired === "1" ? (
            <p className={styles.expired}>
              Your previous link expired. Request a fresh one below.
            </p>
          ) : null}
          <SignInForm
            organizationId={
              query.org && /^[0-9a-f-]{36}$/i.test(query.org)
                ? query.org
                : undefined
            }
          />
        </div>
      </div>
    </main>
  );
}
