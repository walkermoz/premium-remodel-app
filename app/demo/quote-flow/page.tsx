import QuoteFlowTemplatesSettings from "@/components/quote-flow-templates-settings";
import styles from "./quote-flow-demo.module.css";

export default function QuoteFlowDemoPage() {
  return (
    <main className={styles.page}>
      <QuoteFlowTemplatesSettings demo canPublish />
    </main>
  );
}
