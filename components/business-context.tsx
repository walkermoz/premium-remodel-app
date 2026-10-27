"use client";

import { createContext, useContext } from "react";
import type { BusinessConfig } from "@/lib/business-config-schema";

const BusinessContext = createContext<BusinessConfig | null>(null);

export function BusinessProvider({
  config,
  children,
}: {
  config: BusinessConfig;
  children: React.ReactNode;
}) {
  return (
    <BusinessContext.Provider value={config}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusinessConfig() {
  return useContext(BusinessContext);
}
