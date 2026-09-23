"use client";
import { useId } from "react";
import type { Contractor, Workspace } from "@/lib/types";
import { contractorServices } from "@/lib/contractor-services";

export default function ContractorFields({
  contractor,
  workspace,
}: {
  contractor?: Contractor;
  workspace: Workspace;
}) {
  const servicesId = useId();
  const services = Array.from(
    new Set([
      "Tiling",
      "Plumbing",
      ...workspace.contractors.flatMap((c) => contractorServices(c.trade)),
    ]),
  )
    .filter(Boolean)
    .sort();
  return (
    <>
      <label>
        Contact name
        <input
          name="name"
          defaultValue={contractor?.name}
          placeholder="First and last name"
          required
          maxLength={250}
        />
      </label>
      <div className="form-grid">
        <label>
          Company
          <input
            name="company"
            defaultValue={contractor?.company}
            placeholder="Company name"
            maxLength={250}
          />
        </label>
        <label>
          Trade
          <input
            name="trade"
            defaultValue={contractor?.trade}
            placeholder="e.g. Flooring"
            list={servicesId}
            maxLength={250}
          />
          <datalist id={servicesId}>
            {services.map((service) => (
              <option key={service} value={service} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="form-grid">
        <label>
          Email
          <input
            name="email"
            type="email"
            defaultValue={contractor?.email}
            placeholder="name@company.com"
          />
        </label>
        <label>
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={contractor?.phone}
            placeholder="(919) 555-0123"
            maxLength={250}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={contractor?.notes}
          placeholder="Specialties, availability, and other details"
          maxLength={15000}
        />
      </label>
    </>
  );
}
