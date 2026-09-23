import { test, expect } from "@playwright/test";
import {
  addressSearchUrl,
  addressSuggestions,
  wakeAddressSearchUrl,
  wakeAddressSource,
  wakeAddressSuggestions,
} from "../lib/address-search";

const feature = (house = "301", street = "Hillsborough Street") => ({
  properties: {
    housenumber: house,
    street,
    city: "Raleigh",
    state: "North Carolina",
    postcode: "27603",
    countrycode: "US",
  },
});
const result = { features: [feature(), feature(), feature("303")] };
const fullAddress = "301 Hillsborough Street, Raleigh, North Carolina 27603";
const endpoint = "https://photon.komoot.io/api/**";
const wakeEndpoint = `${wakeAddressSource.url}**`;
const caryFeature = {
  attributes: {
    ADDRESS: "1214 Willowbrook Dr",
    USPS_CITY: "Cary",
    ZIPCODE: "27511",
    STATE: "NC",
    COUNTY: "Wake",
  },
};
const caryAddress = "1214 Willowbrook Dr, Cary, NC 27511";

test.beforeEach(async ({ page }) => {
  // Keep routine tests independent of public providers. Individual tests can
  // override this to exercise county matches and provider failures.
  await page.route(wakeEndpoint, (route) =>
    route.fulfill({ json: { features: [] } }),
  );
});

test("county search recognizes full addresses and only accepts Wake County records", () => {
  const url = new URL(
    wakeAddressSearchUrl("1214 Willowbrook Drive, Cary, North Carolina 27511")!,
  );
  const where = url.searchParams.get("where")!;
  expect(where).toContain("UPPER(COMPLETE_ADDRNUM) = '1214'");
  for (const token of ["WILLOWBROOK", "DR", "CARY", "NC", "27511"])
    expect(where).toContain(`LIKE '%${token}%'`);
  expect(wakeAddressSearchUrl("1214 Willowbrook Dr, Suffolk, VA")).toBeNull();
  expect(
    wakeAddressSearchUrl("1214 Willowbrook Dr, Suffolk, VA 23434"),
  ).toBeNull();
  expect(
    new URL(wakeAddressSearchUrl("45 O'Connor Ln")!).searchParams.get("where"),
  ).toContain("O''CONNOR");
  expect(
    wakeAddressSuggestions({
      features: [
        caryFeature,
        caryFeature,
        { attributes: { ...caryFeature.attributes, COUNTY: "Durham" } },
        { attributes: { ...caryFeature.attributes, STATE: "VA" } },
        { attributes: { ...caryFeature.attributes, ADDRESS: "" } },
        null,
      ],
    }),
  ).toEqual([
    {
      address: caryAddress,
      street: "1214 Willowbrook Dr",
      location: "Cary, NC 27511",
      source: "wake",
    },
  ]);
  expect(() =>
    wakeAddressSuggestions({ error: { message: "Unavailable" } }),
  ).toThrow();
});

test("Cary address appears from a partial street without unrelated national results", async ({
  page,
}) => {
  let nationwideSearches = 0;
  await page.route(wakeEndpoint, async (route) => {
    const where = new URL(route.request().url()).searchParams.get("where")!;
    expect(where).toContain("UPPER(COMPLETE_ADDRNUM) = '1214'");
    expect(where).toContain("LIKE '%WILLOW%'");
    await route.fulfill({ json: { features: [caryFeature] } });
  });
  await page.route(endpoint, async (route) => {
    nationwideSearches++;
    await route.fulfill({ json: result });
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const input = page.getByLabel("Job address");
  await input.fill("1214 Willow");
  const options = page
    .getByRole("listbox", { name: "Address suggestions" })
    .getByRole("option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("1214 Willowbrook Dr");
  await expect(options.first()).toContainText("Cary, NC 27511");
  await expect(
    page.getByRole("link", { name: "Wake County GIS" }),
  ).toBeVisible();
  await options.first().click();
  await expect(input).toHaveValue(caryAddress);
  expect(nationwideSearches).toBe(0);
});

test("county HTTP and API errors fall back to nationwide suggestions", async ({
  page,
}) => {
  let searches = 0;
  await page.route(wakeEndpoint, async (route) => {
    searches++;
    await route.fulfill(
      searches === 1
        ? { status: 503, body: "Unavailable" }
        : { json: { error: { message: "Service unavailable" } } },
    );
  });
  await page.route(endpoint, (route) => route.fulfill({ json: result }));
  await page.goto("/demo");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const input = page.getByLabel("Job address");
  for (const query of ["301 Hills", "301 Hillsborough"]) {
    await input.fill(query);
    await expect(
      page
        .getByRole("listbox", { name: "Address suggestions" })
        .getByRole("option"),
    ).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "OpenStreetMap contributors" }),
    ).toBeVisible();
  }
  expect(searches).toBe(2);
});

test("address results preserve complete addresses and exclude duplicates or incomplete places", () => {
  expect(
    addressSuggestions({
      features: [
        ...result.features,
        { properties: { city: "Raleigh", countrycode: "US" } },
        { properties: { ...feature().properties, countrycode: "CA" } },
        null,
      ],
    }).map((item) => item.address),
  ).toEqual([
    fullAddress,
    "303 Hillsborough Street, Raleigh, North Carolina 27603",
  ]);
  const url = new URL(addressSearchUrl(" 301 Hills "));
  expect(url.searchParams.get("q")).toBe("301 Hills");
  expect(url.searchParams.get("countrycode")).toBe("US");
});

test("keyboard selection fills and saves an address without submitting the form early", async ({
  page,
}) => {
  let searches = 0;
  await page.route(endpoint, async (route) => {
    searches++;
    await route.fulfill({ json: result });
  });
  await page.clock.install();
  await page.goto("/demo");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Address selection project");
  const input = dialog.getByRole("combobox", { name: "Job address" });
  await input.fill("301");
  await page.clock.fastForward(500);
  expect(searches).toBe(0);
  await input.fill("301 Hills");
  await page.clock.fastForward(500);
  await expect(
    page.getByRole("option", { name: /Hillsborough Street/ }),
  ).toHaveCount(2);
  await input.press("ArrowDown");
  await expect(
    page
      .getByRole("listbox", { name: "Address suggestions" })
      .getByRole("option")
      .first(),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(input).toHaveValue(fullAddress);
  await expect(dialog).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeFocused();
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("premium-remodel-sample-v1")!,
    ).projects.find(
      (p: { name: string }) => p.name === "Address selection project",
    ),
  );
  expect(saved.address).toBe(fullAddress);
  await page.reload();
  await page
    .getByRole("heading", { name: "Address selection project" })
    .click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(page.getByLabel("Job address")).toHaveValue(fullAddress);
  await page.clock.fastForward(600);
  expect(searches).toBe(1);
});

test("mobile selection, escape, and unavailable suggestions preserve manual entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(endpoint, async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!;
    await route.fulfill(
      q.includes("Manual")
        ? { status: 503, body: "Unavailable" }
        : { json: result },
    );
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Manual address project");
  const input = page.getByLabel("Job address");
  await input.fill("301 Hills");
  await expect(
    page.getByRole("listbox", { name: "Address suggestions" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/address-suggestions-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await input.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await input.press("ArrowDown");
  await page
    .getByRole("listbox", { name: "Address suggestions" })
    .getByRole("option")
    .first()
    .click();
  await expect(input).toHaveValue(fullAddress);
  await input.fill("55 Manual Lane, Raleigh, NC, Unit B");
  await expect(
    page.getByText(
      "Suggestions unavailable. You can enter the address manually.",
    ),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("premium-remodel-sample-v1")!,
    ).projects.find(
      (p: { name: string }) => p.name === "Manual address project",
    ),
  );
  expect(saved.address).toBe("55 Manual Lane, Raleigh, NC, Unit B");
});

test("late searches cannot replace new results or overwrite typed addresses", async ({
  page,
}) => {
  let releaseOld: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.route(endpoint, async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!;
    if (q === "Old address") {
      await pending;
      await route
        .fulfill({ json: { features: [feature("111", "Old Street")] } })
        .catch(() => {});
    } else await route.fulfill({ json: result });
  });
  await page.goto("/demo");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const input = page.getByLabel("Job address");
  const request = page.waitForRequest((url) =>
    url.url().includes("q=Old+address"),
  );
  await input.fill("Old address");
  await request;
  await input.fill("301 Hills");
  await expect(
    page
      .getByRole("listbox", { name: "Address suggestions" })
      .getByRole("option")
      .first(),
  ).toContainText("301 Hillsborough Street");
  releaseOld!();
  await expect(page.getByRole("option", { name: /Old Street/ })).toHaveCount(0);
  await expect(input).toHaveValue("301 Hills");
  await input.fill("");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await expect(input).toHaveValue("");
});
