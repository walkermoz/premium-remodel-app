export interface AddressSuggestion {
  address: string;
  street: string;
  location: string;
  source: "wake" | "osm";
  latitude?: number;
  longitude?: number;
}

export const addressPriorityRegion = {
  name: "Raleigh / Wake County, North Carolina",
  latitude: "35.7796",
  longitude: "-78.6382",
} as const;

export const wakeAddressSource = {
  url: "https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_County_MAR_Address_Data_Public/FeatureServer/0/query",
  attribution:
    "https://www.arcgis.com/home/item.html?id=4d7f78186b0649d081ac56058b041fb7",
} as const;

const streetAbbreviations: Record<string, string> = {
  DRIVE: "DR",
  STREET: "ST",
  ROAD: "RD",
  LANE: "LN",
  COURT: "CT",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  PLACE: "PL",
  CIRCLE: "CIR",
  TRAIL: "TRL",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  TERRACE: "TER",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  APARTMENT: "APT",
  SUITE: "STE",
};
const states = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  ),
);

export function wakeAddressSearchUrl(query: string): string | null {
  const tokens =
    query
      .toUpperCase()
      .replace(/\bNORTH CAROLINA\b/g, "NC")
      .replace(/\bUNITED STATES(?: OF AMERICA)?\b|\bUSA\b|\bCOUNTY\b/g, "")
      .match(/[A-Z0-9]+(?:['-][A-Z0-9]+)*/g) || [];
  if (!tokens.length || tokens.length > 25) return null;
  const regionToken = /^\d{5}(?:-\d{4})?$/.test(tokens.at(-1)!)
    ? tokens.at(-2)
    : tokens.at(-1);
  if (regionToken && states.has(regionToken) && regionToken !== "NC")
    return null;
  const clauses = ["COUNTY = 'Wake'", "STATE = 'NC'"];
  const houseNumber = tokens[0];
  if (houseNumber && /^\d/.test(houseNumber)) {
    // Match the requested house number rather than a fuzzy number elsewhere.
    tokens.shift();
    clauses.push(
      `UPPER(COMPLETE_ADDRNUM) = '${houseNumber.replaceAll("'", "''")}'`,
    );
  }
  for (const raw of tokens) {
    const token = (streetAbbreviations[raw] || raw).replaceAll("'", "''");
    clauses.push(
      `(UPPER(ADDRESS) LIKE '%${token}%' OR UPPER(USPS_CITY) LIKE '%${token}%' OR STATE = '${token}' OR ZIPCODE LIKE '${token}%' OR UPPER(COUNTY) = '${token}')`,
    );
  }
  const url = new URL(wakeAddressSource.url);
  url.search = new URLSearchParams({
    f: "json",
    where: clauses.join(" AND "),
    outFields: "ADDRESS,USPS_CITY,ZIPCODE,STATE,COUNTY",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "8",
    orderByFields: "ADDRESS",
    returnDistinctValues: "false",
  }).toString();
  return url.toString();
}

export function wakeAddressSuggestions(payload: unknown): AddressSuggestion[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("features" in payload) ||
    !Array.isArray(payload.features)
  )
    throw new Error("Invalid county address response");
  const matches = new Map<string, AddressSuggestion>();
  for (const feature of payload.features.slice(0, 50)) {
    const p = feature?.attributes;
    if (!p || typeof p !== "object") continue;
    const field = (name: string) =>
      typeof p[name] === "string" ? p[name].trim() : "";
    if (field("COUNTY").toLowerCase() !== "wake" || field("STATE") !== "NC")
      continue;
    const street = field("ADDRESS"),
      city = field("USPS_CITY");
    if (!street || !city) continue;
    const location = `${city}, NC${field("ZIPCODE") ? ` ${field("ZIPCODE")}` : ""}`;
    const address = `${street}, ${location}`;
    const latitude = Number(feature?.geometry?.y);
    const longitude = Number(feature?.geometry?.x);
    if (address.length <= 250)
      matches.set(address.toLowerCase(), {
        address,
        street,
        location,
        source: "wake",
        ...(Number.isFinite(latitude) && Number.isFinite(longitude)
          ? { latitude, longitude }
          : {}),
      });
  }
  return [...matches.values()].slice(0, 5);
}

export async function searchAddresses(
  query: string,
  signal: AbortSignal,
): Promise<AddressSuggestion[]> {
  async function load(url: string, timeout: number) {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Address search unavailable");
    return response.json();
  }
  const localUrl = wakeAddressSearchUrl(query);
  if (localUrl) {
    try {
      const local = wakeAddressSuggestions(await load(localUrl, 4000));
      if (local.length) return local;
    } catch {
      // A county outage must not prevent nationwide search or manual entry.
      if (signal.aborted) throw new Error("Address search cancelled");
    }
  }
  if (signal.aborted) throw new Error("Address search cancelled");
  return addressSuggestions(await load(addressSearchUrl(query), 5000));
}

export function addressSearchUrl(query: string) {
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({
    q: query.trim(),
    countrycode: "US",
    lang: "en",
    layer: "house",
    limit: "8",
    // Prefer the company's service area without excluding other US addresses.
    lat: addressPriorityRegion.latitude,
    lon: addressPriorityRegion.longitude,
    zoom: "9",
    location_bias_scale: "0",
  }).toString();
  return url.toString();
}

export function addressSuggestions(payload: unknown): AddressSuggestion[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("features" in payload) ||
    !Array.isArray(payload.features)
  )
    throw new Error("Invalid address search response");
  const matches = new Map<string, AddressSuggestion>();
  for (const feature of payload.features.slice(0, 50)) {
    const p = feature?.properties;
    if (!p || typeof p !== "object") continue;
    const field = (name: string) =>
      typeof p[name] === "string" ? p[name].trim() : "";
    if (
      field("countrycode").toUpperCase() !== "US" ||
      !field("housenumber") ||
      !field("street")
    )
      continue;
    const street = `${field("housenumber")} ${field("street")}`;
    const location = [
      field("city") || field("locality") || field("district"),
      [field("state"), field("postcode")].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    if (!location) continue;
    const address = `${street}, ${location}`;
    if (address.length > 250) continue;
    const coordinates = Array.isArray(feature?.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    matches.set(address.toLowerCase(), {
      address,
      street,
      location,
      source: "osm",
      ...(Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : {}),
    });
  }
  return [...matches.values()].slice(0, 5);
}
