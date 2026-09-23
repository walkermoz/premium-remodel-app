import Link from "next/link";
import styles from "./portal.module.css";

export default function ClientPortalNotFound() {
  return (
    <main className={styles.notFound}>
      <img src="/images/logo.png" alt="Premium Remodel" />
      <p>Client project update</p>
      <h1>This project link is no longer available.</h1>
      <span>
        Ask your Premium Remodel project contact for a new update link.
      </span>
      <Link href="https://premiumremodel.com">Visit Premium Remodel</Link>
    </main>
  );
}
