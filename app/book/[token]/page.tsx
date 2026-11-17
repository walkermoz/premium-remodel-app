import { notFound } from "next/navigation";
import { getPublicBookingForm } from "@/lib/booking-forms";
import { getBusinessConfigForOrganization } from "@/lib/business-config";
import BookingExperience from "./booking-experience";
import styles from "./booking.module.css";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = await getPublicBookingForm(token);
  if (!form) notFound();
  const business = await getBusinessConfigForOrganization(form.organizationId);
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <span>{business.profile.name}</span>
          <h1>{form.name}</h1>
          <p>
            {form.intro || "Choose the service and time that work for you."}
          </p>
        </header>
        <BookingExperience
          token={token}
          form={{
            mode: form.mode,
            services: form.services,
            weekdays: form.weekdays,
            bookingWindowDays: form.bookingWindowDays,
            serviceAreaZips: form.serviceAreaZips,
          }}
          business={{
            name: business.profile.name,
            phone: business.profile.phone,
            email: business.profile.email,
            smsReady: Boolean(
              business.compliance.smsPolicyVersion &&
              business.compliance.privacyUrl &&
              business.compliance.termsUrl,
            ),
            privacyUrl: business.compliance.privacyUrl,
            termsUrl: business.compliance.termsUrl,
          }}
        />
      </section>
    </main>
  );
}
