import type { ScopeTemplateRow } from "./scope-templates";

export const existingBathroomItems = [
  ["vanity", "Vanity"],
  ["countertopSink", "Countertop / sink"],
  ["toilet", "Toilet"],
  ["floorTile", "Bathroom floor tile"],
  ["mirror", "Mirror"],
  ["vanityLight", "Vanity light"],
  ["faucet", "Faucet"],
  ["exhaustFan", "Exhaust fan"],
  ["paint", "Paint walls / ceiling"],
] as const;

export type ExistingBathroomItemId = (typeof existingBathroomItems)[number][0];
export type KeepReplaceAnswer = "Keep" | "Replace" | "Unsure";

export const showerFeatureOptions = [
  "Recessed niche",
  "Bench",
  "Corner shelves",
  "Grab bar",
  "Handheld shower",
  "Rain head",
] as const;

export const proposalOptions = [
  ["floorTile", "Replace bathroom floor tile"],
  ["vanityCountertop", "Replace vanity / countertop"],
  ["toilet", "Replace toilet"],
  ["mirrorLight", "Replace mirror / light"],
  ["exhaustFan", "Replace exhaust fan"],
  ["paint", "Paint bathroom"],
] as const;

export type ProposalOptionId = (typeof proposalOptions)[number][0];

export interface BathroomQuestionnaireProject {
  projectName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  preferredStartDate: string;
}

export interface BathroomQuestionnaireAnswers extends BathroomQuestionnaireProject {
  bestContactMethod: "Call" | "Text" | "Email";
  removeDividerWall: boolean;
  keepLayout: boolean;
  tiledShower: boolean;
  roomLength: string;
  roomWidth: string;
  ceilingHeight: string;
  showerWidth: string;
  showerDepth: string;
  existing: Record<ExistingBathroomItemId, KeepReplaceAnswer>;
  dividerPlan: "Remove" | "Keep" | "Review on site";
  dividerUtilities: "Yes" | "No" | "Unsure";
  dividerRepair: string;
  existingConditions: string;
  currentFootprint: "Yes" | "No / change it" | "Unsure";
  showerBase: "Curb" | "Curbless" | "Undecided";
  drain: "Keep current location" | "Reposition if needed" | "Unsure";
  tileStyle: string;
  tileAllowance: "Customer will supply" | "Include allowance" | "Undecided";
  showerFeatures: string[];
  otherShowerFeature: string;
  showerFixtures: "Reuse existing" | "Replace" | "Unsure";
  fixtureFinish: string;
  glassPreference: "Frameless clear glass" | "Other" | "Undecided";
  glassOther: string;
  hardwareFinish: string;
  doorSwing: string;
  proposalItems: Record<ProposalOptionId, boolean>;
  otherWork: string;
  priorities: string;
}

export interface GeneratedBathroomScopeRow extends ScopeTemplateRow {
  details: string;
}

export function defaultBathroomQuestionnaire(
  project?: Partial<BathroomQuestionnaireProject>,
): BathroomQuestionnaireAnswers {
  return {
    projectName: project?.projectName || "Bathroom",
    customerName: project?.customerName || "",
    customerPhone: project?.customerPhone || "",
    customerEmail: project?.customerEmail || "",
    address: project?.address || "",
    preferredStartDate: project?.preferredStartDate || "",
    bestContactMethod: "Call",
    removeDividerWall: false,
    keepLayout: true,
    tiledShower: true,
    roomLength: "",
    roomWidth: "",
    ceilingHeight: "",
    showerWidth: "",
    showerDepth: "",
    existing: Object.fromEntries(
      existingBathroomItems.map(([id]) => [id, "Unsure"]),
    ) as Record<ExistingBathroomItemId, KeepReplaceAnswer>,
    dividerPlan: "Review on site",
    dividerUtilities: "Unsure",
    dividerRepair: "",
    existingConditions: "",
    currentFootprint: "Yes",
    showerBase: "Undecided",
    drain: "Unsure",
    tileStyle: "",
    tileAllowance: "Undecided",
    showerFeatures: [],
    otherShowerFeature: "",
    showerFixtures: "Unsure",
    fixtureFinish: "",
    glassPreference: "Undecided",
    glassOther: "",
    hardwareFinish: "",
    doorSwing: "",
    proposalItems: Object.fromEntries(
      proposalOptions.map(([id]) => [id, false]),
    ) as Record<ProposalOptionId, boolean>,
    otherWork: "",
    priorities: "",
  };
}

function sentence(label: string, value: string) {
  return value.trim() ? `${label}: ${value.trim()}` : "";
}

function details(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" · ");
}

export function buildBathroomScopeRows(
  answers: BathroomQuestionnaireAnswers,
): GeneratedBathroomScopeRow[] {
  const rows = new Map<string, GeneratedBathroomScopeRow>();
  const add = (
    id: string,
    title: string,
    unit: "job" | "sq ft",
    detailParts: Array<string | false | undefined>,
  ) => {
    const nextDetails = details(...detailParts);
    const existing = rows.get(id);
    rows.set(id, {
      id,
      title,
      unit,
      details: details(existing?.details, nextDetails),
    });
  };

  const dimensions = details(
    answers.roomLength && answers.roomWidth
      ? `Room: ${answers.roomLength} x ${answers.roomWidth}`
      : sentence("Room length", answers.roomLength) ||
          sentence("Room width", answers.roomWidth),
    sentence("Ceiling height", answers.ceilingHeight),
    answers.showerWidth && answers.showerDepth
      ? `Shower: ${answers.showerWidth} x ${answers.showerDepth}`
      : sentence("Shower width", answers.showerWidth) ||
          sentence("Shower depth", answers.showerDepth),
  );
  const existingSelections = existingBathroomItems
    .map(([id, label]) => `${label}: ${answers.existing[id]}`)
    .join("; ");
  add("demolition", "Demolition & site protection", "job", [
    dimensions,
    `Existing selections: ${existingSelections}`,
    answers.keepLayout
      ? "Keep vanity, toilet, and shower in their current locations"
      : "Layout changes requested",
    sentence("Existing conditions", answers.existingConditions),
    sentence("Best contact", answers.bestContactMethod),
  ]);

  if (answers.removeDividerWall || answers.dividerPlan !== "Keep") {
    add("divider-wall", "Divider wall removal & wall repairs", "job", [
      `Plan: ${answers.removeDividerWall ? "Remove full divider wall" : answers.dividerPlan}`,
      `Switches, outlets, or plumbing in wall: ${answers.dividerUtilities}`,
      sentence("Patch / refinish", answers.dividerRepair),
    ]);
  }
  if (
    answers.removeDividerWall ||
    answers.dividerPlan === "Remove" ||
    answers.currentFootprint === "No / change it"
  )
    add("framing", "Framing & preparation", "job", [
      answers.currentFootprint === "No / change it"
        ? "Shower footprint will change"
        : "Prepare framing for selected work",
    ]);

  const replacing = (id: ExistingBathroomItemId) =>
    answers.existing[id] === "Replace";
  const unsure = (id: ExistingBathroomItemId) =>
    answers.existing[id] === "Unsure";

  if (
    answers.tiledShower ||
    replacing("faucet") ||
    replacing("toilet") ||
    replacing("vanity") ||
    replacing("countertopSink") ||
    answers.proposalItems.toilet ||
    answers.proposalItems.vanityCountertop
  )
    add("plumbing", "Plumbing adjustments", "job", [
      answers.tiledShower && `Drain: ${answers.drain}`,
      replacing("faucet") && "Replace faucet",
      (replacing("vanity") || replacing("countertopSink")) &&
        "Connect vanity / sink",
      (replacing("toilet") || answers.proposalItems.toilet) &&
        "Reset / replace toilet",
    ]);

  if (
    answers.dividerUtilities !== "No" ||
    replacing("vanityLight") ||
    replacing("exhaustFan") ||
    answers.proposalItems.mirrorLight ||
    answers.proposalItems.exhaustFan
  )
    add("electrical", "Electrical adjustments", "job", [
      answers.dividerPlan !== "Keep" &&
        `Divider wall utilities: ${answers.dividerUtilities}`,
      (replacing("vanityLight") || answers.proposalItems.mirrorLight) &&
        "Vanity light work",
      (replacing("exhaustFan") || answers.proposalItems.exhaustFan) &&
        "Exhaust fan work",
    ]);

  if (answers.tiledShower) {
    add("waterproofing", "Shower base & waterproofing", "job", [
      `Footprint: ${answers.currentFootprint}`,
      `Base: ${answers.showerBase}`,
      `Drain: ${answers.drain}`,
      dimensions,
    ]);
    add("shower-tile", "Shower wall tile installation", "sq ft", [
      "Floor-to-ceiling shower wall tile",
      sentence("Tile selection", answers.tileStyle),
      `Tile allowance: ${answers.tileAllowance}`,
    ]);
    if (answers.showerFeatures.length || answers.otherShowerFeature.trim())
      add("shower-features", "Shower niche, bench & accessories", "job", [
        details(...answers.showerFeatures),
        sentence("Other feature", answers.otherShowerFeature),
      ]);
    add("shower-fixtures", "Shower fixtures & trim", "job", [
      `Valve, trim, and shower head: ${answers.showerFixtures}`,
      sentence("Preferred finish / brand", answers.fixtureFinish),
    ]);
    add("glass", "Custom glass shower enclosure", "job", [
      `Glass: ${answers.glassPreference}`,
      sentence("Other glass", answers.glassOther),
      sentence("Hardware finish", answers.hardwareFinish),
      sentence("Door swing / opening", answers.doorSwing),
    ]);
  }

  if (
    replacing("vanity") ||
    replacing("countertopSink") ||
    replacing("faucet") ||
    answers.proposalItems.vanityCountertop ||
    unsure("vanity") ||
    unsure("countertopSink")
  )
    add("vanity", "Vanity, countertop & sink", "job", [
      `Vanity: ${answers.existing.vanity}`,
      `Countertop / sink: ${answers.existing.countertopSink}`,
      `Faucet: ${answers.existing.faucet}`,
      answers.proposalItems.vanityCountertop && "Include in proposal",
    ]);
  if (replacing("toilet") || answers.proposalItems.toilet || unsure("toilet"))
    add("toilet", "Toilet installation", "job", [
      `Existing selection: ${answers.existing.toilet}`,
      answers.proposalItems.toilet && "Include in proposal",
    ]);
  if (
    replacing("floorTile") ||
    answers.proposalItems.floorTile ||
    unsure("floorTile")
  )
    add("floor-tile", "Bathroom floor tile", "sq ft", [
      `Existing selection: ${answers.existing.floorTile}`,
      answers.proposalItems.floorTile && "Include in proposal",
      sentence("Tile selection", answers.tileStyle),
    ]);
  if (
    replacing("mirror") ||
    replacing("vanityLight") ||
    replacing("exhaustFan") ||
    answers.proposalItems.mirrorLight ||
    answers.proposalItems.exhaustFan ||
    unsure("mirror") ||
    unsure("vanityLight") ||
    unsure("exhaustFan")
  )
    add("mirror-light-fan", "Mirror, vanity light & exhaust fan", "job", [
      `Mirror: ${answers.existing.mirror}`,
      `Vanity light: ${answers.existing.vanityLight}`,
      `Exhaust fan: ${answers.existing.exhaustFan}`,
      (answers.proposalItems.mirrorLight || answers.proposalItems.exhaustFan) &&
        "Include selected items in proposal",
    ]);
  add("paint-finish", "Paint, finish carpentry & final cleanup", "job", [
    `Paint walls / ceiling: ${answers.existing.paint}`,
    answers.proposalItems.paint && "Paint bathroom included",
    sentence("Priorities / notes", answers.priorities),
  ]);
  if (answers.tileAllowance === "Include allowance")
    add("allowances", "Tile & fixture material allowance", "job", [
      sentence("Tile style / color / size", answers.tileStyle),
      sentence("Fixture finish / brand", answers.fixtureFinish),
    ]);
  if (answers.otherWork.trim())
    add("other-work", "Other bathroom work", "job", [answers.otherWork]);

  return Array.from(rows.values());
}
