import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1060 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://localhost:3000/demo");
await page.getByRole("heading", { name: "Oakwood kitchen remodel" }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: "artifacts/desktop.png",
  fullPage: true,
  animations: "disabled",
});
await page
  .getByRole("button", { name: /Kitchen.*Oakwood kitchen remodel/ })
  .click();
await page.getByRole("heading", { name: "Project brief" }).waitFor();
await page.screenshot({
  path: "artifacts/project.png",
  fullPage: true,
  animations: "disabled",
});
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://localhost:3000/demo");
await page.getByRole("heading", { name: "Oakwood kitchen remodel" }).waitFor();
await page.screenshot({
  path: "artifacts/mobile.png",
  fullPage: true,
  animations: "disabled",
});
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await page.goto("http://localhost:3000/login");
await page.setViewportSize({ width: 1440, height: 1000 });
await page.screenshot({
  path: "artifacts/login.png",
  fullPage: true,
  animations: "disabled",
});
console.log(JSON.stringify({ errors, mobileOverflow: overflow }));
await browser.close();
