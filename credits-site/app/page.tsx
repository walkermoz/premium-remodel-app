import type { Metadata } from "next";
import { CreditsStrategy } from "./strategy-client";
import styles from "./credits.module.css";

export const metadata: Metadata = {
  title: "CREDITS STRATEGY — Perpetual art acquisition",
  description:
    "A TokenStrategy-powered acquisition machine for the Credits collection.",
};

export default function CreditsStrategyPage() {
  return (
    <main className={styles.page}>
      <CreditsStrategy />
    </main>
  );
}
