import { expect, test } from "@playwright/test";
import { allowedBrowserOrigin } from "../lib/request-origin-policy";
const canonical = "https://servicebuddy-ui.vercel.app";
const dashboard = "https://dashboard.premiumremodel.com";

test("canonical and explicitly configured dashboard origins are trusted", () => {
  expect(allowedBrowserOrigin(canonical, canonical)).toBe(true);
  expect(allowedBrowserOrigin(dashboard, canonical)).toBe(false);
  expect(allowedBrowserOrigin(dashboard, canonical, dashboard)).toBe(true);
  expect(
    allowedBrowserOrigin(
      dashboard,
      canonical,
      ` ${dashboard}/ , https://office.example.test `,
    ),
  ).toBe(true);
});
test("foreign origins, deceptive suffixes and missing browser origins stay blocked", () => {
  for (const origin of [
    null,
    "",
    "null",
    "https://untrusted.example",
    `${dashboard}.evil.example`,
    "http://dashboard.premiumremodel.com",
    "https://dashboard.premiumremodel.com:444",
    `${dashboard}/login`,
    `${dashboard}:443`,
    "https://premiumremodel.com",
  ])
    expect(
      allowedBrowserOrigin(origin, canonical, dashboard),
      String(origin),
    ).toBe(false);
});
test("invalid or broad additional-origin entries grant no access", () => {
  for (const extra of [
    "*",
    "null",
    "https://*.premiumremodel.com",
    "https://dashboard.premiumremodel.com/login",
    "https://user:pass@dashboard.premiumremodel.com",
    `${dashboard}?x=1`,
    `${dashboard}#login`,
    "data:text/plain,example",
    "file:///example",
  ])
    expect(allowedBrowserOrigin(dashboard, canonical, extra), extra).toBe(
      false,
    );
});
test("unconfigured deployments and local aliases require an explicit origin", () => {
  const local = "http://localhost:3100",
    alias = "http://127.0.0.1:3100";
  expect(allowedBrowserOrigin(local, local)).toBe(true);
  expect(allowedBrowserOrigin(alias, local)).toBe(false);
  expect(allowedBrowserOrigin(alias, local, alias)).toBe(true);
});
