import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "./supabase/server";

const clientScheduleItemSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1),
  description: z.string().optional().default(""),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  workType: z
    .enum(["Task", "Inspection", "Delivery", "Contractor visit"])
    .default("Task"),
  status: z.enum(["To do", "In progress", "Done"]),
});

export type ClientScheduleItem = z.infer<typeof clientScheduleItemSchema>;

/** Returns only the task fields that are safe to publish to a customer. */
export async function readClientProjectSchedule(
  organizationId: string,
  projectId: string,
) {
  const result = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("kind", "task")
    .limit(500);
  if (result.error) throw result.error;
  return result.data
    .map((row) => clientScheduleItemSchema.safeParse(row.data))
    .filter((item) => item.success)
    .map((item) => item.data)
    .sort((a, b) =>
      `${a.dueDate} ${a.startTime || ""} ${a.title}`.localeCompare(
        `${b.dueDate} ${b.startTime || ""} ${b.title}`,
      ),
    );
}
