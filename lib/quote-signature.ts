import { z } from "zod";

const point = z.tuple([
  z.number().finite().min(0).max(1),
  z.number().finite().min(0).max(1),
]);

export const signatureStrokesSchema = z
  .array(z.array(point).min(2).max(1000))
  .min(1)
  .max(40)
  .refine((strokes) => {
    let points = 0;
    let length = 0;
    for (const stroke of strokes) {
      points += stroke.length;
      for (let i = 1; i < stroke.length; i++)
        length += Math.hypot(
          stroke[i][0] - stroke[i - 1][0],
          stroke[i][1] - stroke[i - 1][1],
        );
    }
    return points <= 3000 && length >= 0.04;
  }, "Draw your signature before accepting the quote.");

export const quoteAcceptanceSchema = z.object({
  signedName: z.string().trim().min(2).max(100),
  signedAt: z.iso.datetime(),
  signatureStrokes: signatureStrokesSchema,
  linkId: z.uuid(),
  quoteUpdatedAt: z.iso.datetime(),
  quoteSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  agreementText: z.string().min(1).max(500),
  ip: z.string().max(80).optional(),
  userAgent: z.string().max(300).optional(),
});
