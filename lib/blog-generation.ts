import { z } from "zod";

export const blogToneOptions = [
  { id: "practical", label: "Practical expert" },
  { id: "conversational", label: "Conversational" },
  { id: "premium", label: "Polished and premium" },
  { id: "educational", label: "Educational" },
] as const;

export const blogLengthOptions = [
  { id: "short", label: "Short", words: 700 },
  { id: "standard", label: "Standard", words: 1_000 },
  { id: "detailed", label: "Detailed", words: 1_400 },
] as const;

export const blogBriefSchema = z
  .object({
    topic: z.string().trim().min(5).max(240),
    audience: z.string().trim().max(200).default(""),
    angle: z.string().trim().max(500).default(""),
    keywords: z.string().trim().max(300).default(""),
    tone: z
      .enum(blogToneOptions.map((option) => option.id))
      .default("practical"),
    length: z
      .enum(blogLengthOptions.map((option) => option.id))
      .default("standard"),
  })
  .strict();

export type BlogBrief = z.infer<typeof blogBriefSchema>;

export const blogDraftSchema = z.object({
  title: z.string().trim().min(5).max(140),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: z.string().trim().min(20).max(320),
  metaDescription: z.string().trim().min(40).max(180),
  keywords: z.array(z.string().trim().min(1).max(80)).max(10),
  bodyMarkdown: z.string().trim().min(400).max(30_000),
});

export type BlogDraft = z.infer<typeof blogDraftSchema>;

export function naturalizeBlogText(value: string) {
  return value
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\bdelve into\b/gi, "look at")
    .replace(/\bin today(?:'|\u2019)s (?:fast-paced )?world,?\s*/gi, "")
    .replace(/\bin conclusion,?\s*/gi, "")
    .replace(/,\s*,+/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

function safeSlug(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
  return slug || fallback;
}

export function sanitizeBlogDraft(input: unknown): BlogDraft {
  const raw = blogDraftSchema
    .omit({ slug: true })
    .extend({ slug: z.string().trim().max(160).optional().default("") })
    .parse(input);
  const title = naturalizeBlogText(raw.title);
  return blogDraftSchema.parse({
    ...raw,
    title,
    slug: safeSlug(raw.slug || title, "blog-post"),
    excerpt: naturalizeBlogText(raw.excerpt),
    metaDescription: naturalizeBlogText(raw.metaDescription),
    keywords: raw.keywords.map(naturalizeBlogText).filter(Boolean),
    bodyMarkdown: naturalizeBlogText(raw.bodyMarkdown),
  });
}

export function demoBlogDraft(topic: string, businessName: string): BlogDraft {
  const cleanTopic = naturalizeBlogText(topic || "Planning a home remodel");
  const shortTopic = cleanTopic.slice(0, 88).trim();
  return sanitizeBlogDraft({
    title: `${shortTopic}: What Homeowners Should Know`,
    slug: safeSlug(shortTopic, "planning-a-home-remodel"),
    excerpt: `A practical guide from ${businessName} for making confident decisions before work begins.`,
    metaDescription:
      `Learn how to plan ${shortTopic.toLowerCase()} with clear priorities, realistic expectations, and fewer surprises.`.slice(
        0,
        180,
      ),
    keywords: [shortTopic, "remodel planning", "home improvement"],
    bodyMarkdown: `A successful remodel starts well before demolition. The best early decisions are usually the simple ones: define what needs to change, decide what matters most, and understand how the work will affect the rest of the home.

## Start with the problem, not the product

It is easy to begin with finishes, fixtures, and inspiration photos. Those choices matter, but they make more sense after the practical goals are clear. Write down what is not working today. Consider storage, traffic flow, lighting, maintenance, and how the room needs to support daily life.

## Set priorities before setting a budget

Separate must-haves from preferences. If every choice carries the same weight, it becomes difficult to make good tradeoffs later. A clear priority list helps the project team protect the most important parts of the plan when pricing, availability, or site conditions change.

## Ask what is included

A useful proposal should explain the scope, not just show a total. Review demolition, preparation, installation, cleanup, allowances, and exclusions. If a detail is important to the result, make sure it is discussed before work begins.

## Plan for decisions during construction

Some choices need to be made early so materials can arrive on time. Others are best confirmed after existing conditions are visible. Ask which selections have deadlines and who is responsible for each decision.

## Keep communication simple

Choose one reliable place for approvals, schedule updates, and project questions. Clear communication reduces duplicate work and makes it easier to understand what has changed.

${businessName} can help turn an early idea into a practical scope with clear next steps. Start with the room, the problem, and the result you want to live with.`,
  });
}
