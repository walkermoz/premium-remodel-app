import styles from "./quote.module.css";

export default function QuoteNotFound() {
  return (
    <main className={styles.unavailable}>
      <img src="/images/logo.png" alt="Premium Remodel" />
      <h1>This quote is unavailable</h1>
      <p>
        The link may have been replaced or disabled. Please contact Premium
        Remodel for a current copy.
      </p>
      <a href="mailto:contact@premiumremodel.com">Contact Premium Remodel</a>
    </main>
  );
}
