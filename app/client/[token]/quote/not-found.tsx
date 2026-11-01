import Link from "next/link";
import styles from "./quote.module.css";

export default function QuoteNotFound() {
  return (
    <main className={styles.unavailable}>
      <img src="/icons/servicebuddy-512.png" alt="ServiceBuddy" />
      <h1>This quote is unavailable</h1>
      <p>
        The link may have been replaced or disabled. Please contact the company
        that sent it for a current copy.
      </p>
      <Link href="/client/sign-in">Request a new private link</Link>
    </main>
  );
}
