import { z } from "zod";

export const assemblyComponent = z.object({
  pricebookItemId: z.uuid(),
  quantity: z.number().positive().max(1_000_000),
  contractorId: z.string().min(1).max(100).optional(),
});

export const assemblyInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(100).default(""),
  components: z.array(assemblyComponent).min(1).max(50),
});

export type PricebookAssembly = z.infer<typeof assemblyInput> & {
  id: string;
  revision: number;
  active: boolean;
};

export function mapPricebookAssembly(
  row: Record<string, unknown>,
): PricebookAssembly {
  return {
    id: String(row.id),
    revision: Number(row.revision),
    active: row.active === true,
    ...assemblyInput.parse(row),
  };
}
