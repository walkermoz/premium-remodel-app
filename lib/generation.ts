export const defaultGenerationModel = "google/gemini-3.1-flash-image";

export const generationModels = [
  { id: defaultGenerationModel, name: "Nano Banana 2 · Google" },
  { id: "google/gemini-3-pro-image", name: "Nano Banana Pro · Google" },
  { id: "openai/gpt-image-2", name: "GPT Image 2 · OpenAI" },
  {
    id: "black-forest-labs/flux.2-pro",
    name: "FLUX.2 Pro · Black Forest Labs",
  },
  { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5 · ByteDance" },
] as const;

export const renovationStyles = [
  {
    id: "modern",
    name: "Modern",
    description: "Clean lines, stone & black fixtures",
    colors: ["#d9d7d2", "#959d9b", "#303839"],
    prompt:
      "Contemporary modern bathroom: large-format porcelain tile, a floating vanity, understated stone surfaces, frameless glass and matte black fixtures. Clean lines and a restrained neutral palette.",
  },
  {
    id: "spa",
    name: "Warm spa",
    description: "Natural oak, soft stone & brass",
    colors: ["#e5ddce", "#baa080", "#b09762"],
    prompt:
      "Warm organic spa bathroom: natural oak vanity, warm limestone-look porcelain, soft ivory walls, brushed brass fixtures, subtle texture and warm, flattering lighting.",
  },
  {
    id: "classic",
    name: "Classic",
    description: "White tile, shaker cabinets & chrome",
    colors: ["#f4f1e9", "#c7cdcd", "#969da2"],
    prompt:
      "Timeless classic bathroom: white subway or marble-look tile, shaker vanity cabinetry, polished chrome fixtures, elegant simple mirrors and balanced sconces. Soft white and pale gray palette.",
  },
  {
    id: "coastal",
    name: "Coastal",
    description: "Airy whites, pale blue & light wood",
    colors: ["#f0ede4", "#9bb9c2", "#cabca0"],
    prompt:
      "Refined coastal bathroom: airy warm whites, muted sea-blue accents, light oak vanity, subtle textured tile and brushed nickel fixtures. Light and relaxed, with no nautical props or themed decoration.",
  },
  {
    id: "farmhouse",
    name: "Farmhouse",
    description: "Warm wood, white tile & dark metal",
    colors: ["#ede9e0", "#927860", "#414440"],
    prompt:
      "Modern farmhouse bathroom: warm wood vanity, white ceramic tile, simple paneled cabinetry, matte black hardware, understated vintage-inspired lighting and practical modern fixtures.",
  },
  {
    id: "luxury",
    name: "Luxury",
    description: "Marble, rich walnut & warm metals",
    colors: ["#d7d2ca", "#685247", "#b49b68"],
    prompt:
      "Refined luxury bathroom: elegant marble-look slabs with subtle veining, rich walnut vanity, brushed warm-metal fixtures, layered lighting and premium frameless glass. Sophisticated, realistic and uncluttered.",
  },
  {
    id: "rustic",
    name: "Rustic",
    description: "Timber, earthy tones & dark metal",
    colors: ["#806345", "#bbb09b", "#45483e"],
    prompt:
      "Restrained rustic design with natural timber, earthy colors, durable textured materials and dark metal details. Clean craftsmanship and practical, uncluttered finishes.",
  },
  {
    id: "industrial",
    name: "Industrial",
    description: "Concrete, warm wood & black steel",
    colors: ["#aba9a3", "#947859", "#363c40"],
    prompt:
      "Refined industrial style: concrete-look finishes, black metal details, warm wood and functional lighting. Keep a comfortable residential feel.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Simple forms, pale wood & neutrals",
    colors: ["#efede6", "#c7b99e", "#a9afa8"],
    prompt:
      "Minimal Scandinavian style: simple forms, pale wood, light neutral finishes, discreet storage and restrained detailing.",
  },
  {
    id: "utility",
    name: "Practical",
    description: "Durable finishes & useful storage",
    colors: ["#d3d4cd", "#7f8c83", "#747772"],
    prompt:
      "Practical durable design: economical, well-finished materials, organized storage, easy-care surfaces and useful lighting. Visually tidy and appropriate for everyday use.",
  },
] as const;

export const generationProjectTypes = [
  {
    id: "bathroom",
    name: "Bathroom",
    styles: ["modern", "spa", "classic", "coastal", "farmhouse", "luxury"],
    context:
      "Renovate the bathroom. Update visible tile, vanity, fixtures, mirror and lighting while preserving the positions of the toilet, vanity, tub and shower.",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    styles: ["modern", "classic", "coastal", "farmhouse", "luxury", "minimal"],
    context:
      "Renovate the kitchen. Update cabinets, countertops, backsplash, hardware, lighting and visible appliance finishes. Preserve the layout and positions of appliances, sink, doors and windows.",
  },
  {
    id: "deck",
    name: "Deck",
    styles: ["modern", "coastal", "rustic", "classic"],
    context:
      "Renovate the existing deck with appropriate decking, railings, stairs and outdoor furnishings. If the photo shows an empty outdoor area instead, visualize a realistically sized deck in that area. Preserve the house, yard, property boundaries and access points.",
  },
  {
    id: "basement",
    name: "Basement",
    styles: ["modern", "industrial", "classic", "minimal", "utility"],
    context:
      "Finish or renovate the basement with walls, flooring, ceiling finishes, lighting and practical furnishings. Preserve visible structural posts, ceiling height, stairways and utility access. Do not hide or remove required openings or invent daylight windows.",
  },
  {
    id: "attic",
    name: "Attic",
    styles: ["minimal", "rustic", "modern", "classic"],
    context:
      "Finish or renovate the attic. Work with existing roof slopes, headroom, beams, stairs and windows. Use appropriate finishes, built-in storage and lighting. Do not enlarge the roof or invent dormers or skylights.",
  },
  {
    id: "shed",
    name: "Shed",
    styles: ["modern", "farmhouse", "rustic", "utility"],
    context:
      "Renovate the photographed shed, or add a realistically sized shed if the photo shows an empty site. Use a coherent roof, siding, door and trim design appropriate to its setting. Preserve the surrounding property and access. If the photo is a shed interior, improve its finishes and storage instead.",
  },
  {
    id: "other",
    name: "Other project",
    styles: ["modern", "classic", "coastal", "rustic", "minimal", "utility"],
    context:
      "Visualize the requested remodeling or improvement project in the photographed space. Adapt the finishes and furnishings to that project while preserving the surrounding property and existing structure.",
  },
] as const;

export type GenerationModel = { id: string; name: string };
const projectStyleDetails: Record<string, string> = {
  "kitchen:modern": "Slab cabinets, stone & clean lines",
  "kitchen:classic": "Shaker cabinets & timeless finishes",
  "kitchen:coastal": "White cabinets, pale blue & light oak",
  "kitchen:farmhouse": "Warm wood, shaker doors & dark metal",
  "kitchen:luxury": "Rich walnut, veined stone & brass",
  "kitchen:minimal": "Pale oak, flat fronts & hidden storage",
  "deck:modern": "Composite boards & black railings",
  "deck:coastal": "Pale decking & white railings",
  "deck:rustic": "Natural timber & simple details",
  "deck:classic": "Wood decking & traditional rails",
  "basement:modern": "Clean finishes & comfortable seating",
  "basement:classic": "Warm neutrals & timeless built-ins",
  "attic:modern": "Clean lines & built-in storage",
  "attic:classic": "Soft neutrals & traditional joinery",
  "shed:modern": "Clean siding & streamlined trim",
  "shed:farmhouse": "Board-and-batten & classic trim",
  "shed:rustic": "Natural wood & barn-style details",
  "shed:utility": "Durable siding & organized storage",
  "other:classic": "Timeless finishes & traditional details",
  "other:modern": "Clean lines, stone & dark accents",
};

export function stylesForProject(projectType: string) {
  const project = generationProjectTypes.find(
    (item) => item.id === projectType,
  );
  return renovationStyles
    .filter((style) =>
      (project?.styles as readonly string[] | undefined)?.includes(style.id),
    )
    .map((style) => ({
      ...style,
      description:
        projectStyleDetails[`${projectType}:${style.id}`] || style.description,
    }));
}
export type GenerationConfig = {
  models: GenerationModel[];
  defaultModel: string;
  configured: boolean;
};

export function renovationPrompt(
  projectType: string,
  styleId: string,
  notes: string,
  otherProject = "",
) {
  const project = generationProjectTypes.find(
    (item) => item.id === projectType,
  );
  const style = stylesForProject(projectType).find(
    (item) => item.id === styleId,
  );
  if (
    !project ||
    !style ||
    !(project.styles as readonly string[]).includes(styleId)
  )
    throw new Error("Choose a project type and an available style.");
  return [
    "Edit the supplied photograph into one photorealistic completed renovation or improvement of that SAME space.",
    `Project: ${project.id === "other" ? otherProject.trim() : project.name}. ${project.context}`,
    "Preserve the original camera position, perspective, room or site proportions, framing and aspect ratio. Retain existing structural elements and access points. Do not invent extra indoor space, move plumbing or change the surrounding property. Apply improvements only to the requested project area.",
    "Update the visible finishes and details to suit the chosen style and project. Remove loose clutter. Keep realistic reflections, materials, lighting and construction details.",
    `Style direction: ${project.id === "bathroom" ? style.prompt : `${style.name}: ${style.description}. Apply these materials and colors appropriately to this project type, using weather-resistant materials outdoors. Do not add bathroom fixtures to other spaces.`}`,
    notes.trim() ? `Additional homeowner preferences: ${notes.trim()}` : "",
    "Return a single finished project photograph. No collage, before-and-after split, labels, text, people or watermarks. This is a visual design concept, not a construction drawing.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
