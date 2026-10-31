"use client";

import styles from "./quote-customer-preview.module.css";

export default function QuoteCustomerPreview({
  quoteId,
  onClose,
}: {
  quoteId: string;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Customer quote preview"
      >
        <header>
          <div>
            <h2>Customer quote preview</h2>
            <p>
              This is the PDF the customer receives by email and can download
              from the portal.
            </p>
          </div>
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <iframe
          title="Customer quote PDF"
          src={`/api/quotes/${encodeURIComponent(quoteId)}/pdf?view=1`}
        />
      </div>
    </div>
  );
}
