"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type RegionalFormat = {
  locale: string;
  currency: string;
  timezone: string;
};

const defaultRegionalFormat: RegionalFormat = {
  locale: "en-US",
  currency: "USD",
  timezone: "America/New_York",
};

const RegionalFormatContext = createContext(defaultRegionalFormat);

export function RegionalFormatProvider({
  value,
  children,
}: {
  value: RegionalFormat;
  children: ReactNode;
}) {
  const stable = useMemo(
    () => ({
      locale: value.locale,
      currency: value.currency,
      timezone: value.timezone,
    }),
    [value.currency, value.locale, value.timezone],
  );
  return (
    <RegionalFormatContext.Provider value={stable}>
      {children}
    </RegionalFormatContext.Provider>
  );
}

export function useRegionalFormat() {
  const regional = useContext(RegionalFormatContext);
  return useMemo(
    () => ({
      ...regional,
      money(value: number, options?: Intl.NumberFormatOptions) {
        return new Intl.NumberFormat(regional.locale, {
          style: "currency",
          currency: regional.currency,
          ...options,
        }).format(value);
      },
      cents(value: number, options?: Intl.NumberFormatOptions) {
        return new Intl.NumberFormat(regional.locale, {
          style: "currency",
          currency: regional.currency,
          ...options,
        }).format(value / 100);
      },
      number(value: number, options?: Intl.NumberFormatOptions) {
        return new Intl.NumberFormat(regional.locale, options).format(value);
      },
      date(
        value: string | number | Date,
        options: Intl.DateTimeFormatOptions = {
          month: "short",
          day: "numeric",
          year: "numeric",
        },
      ) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat(regional.locale, {
          timeZone: regional.timezone,
          ...options,
        }).format(date);
      },
      dateTime(
        value: string | number | Date,
        options: Intl.DateTimeFormatOptions = {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";
        return new Intl.DateTimeFormat(regional.locale, {
          timeZone: regional.timezone,
          ...options,
        }).format(date);
      },
      wallTime(
        value: string,
        options: Intl.DateTimeFormatOptions = {
          hour: "numeric",
          minute: "2-digit",
        },
      ) {
        const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
        if (!match) return value;
        return new Intl.DateTimeFormat(regional.locale, {
          timeZone: "UTC",
          ...options,
        }).format(
          new Date(
            Date.UTC(
              2000,
              0,
              1,
              Number(match[1]),
              Number(match[2]),
              Number(match[3] || 0),
            ),
          ),
        );
      },
    }),
    [regional],
  );
}
