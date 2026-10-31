import { z } from "zod";
import { assemblyInput, type PricebookAssembly } from "./pricebook-assemblies";

const key = "premium-remodel-demo-assemblies-v1";
const storedAssembly = assemblyInput.extend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  active: z.boolean(),
});

export function readDemoAssemblies(): PricebookAssembly[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = z
      .array(storedAssembly)
      .safeParse(JSON.parse(localStorage.getItem(key) || "[]"));
    return parsed.success
      ? parsed.data.filter((assembly) => assembly.active)
      : [];
  } catch {
    return [];
  }
}

export function writeDemoAssemblies(assemblies: PricebookAssembly[]) {
  localStorage.setItem(key, JSON.stringify(assemblies));
}
