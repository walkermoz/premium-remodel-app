import { randomUUID } from "node:crypto";
import { expect, test, password } from "./supabase-fixture";
import sharp from "sharp";

const cloudTest = process.env.RUN_SUPABASE_TESTS === "1" ? test : test.skip;
const origin = { Origin: "http://localhost:3100" };

cloudTest(
  "room scan sessions upload privately and render on their quote",
  async ({ company, page }) => {
    const quoteId = randomUUID();
    const now = new Date().toISOString();
    const profile = await company.admin
      .from("profiles")
      .select("id")
      .eq("organization_id", company.organizationId)
      .eq("email", company.email)
      .single();
    expect(profile.error).toBeNull();
    const quote = {
      id: quoteId,
      name: "Room scan test quote",
      address: "1214 Willowbrook Drive, Cary, NC 27513",
      client: "Room Scan Customer",
      clientEmail: "room-scan@example.com",
      clientPhone: "",
      startDate: "",
      endDate: "",
      status: "Draft",
      description: "",
      category: "Bathroom",
      cover: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      const inserted = await company.admin.from("remodel_records").insert({
        id: quoteId,
        organization_id: company.organizationId,
        created_by: profile.data!.id,
        updated_by: profile.data!.id,
        kind: "quote",
        project_id: null,
        data: quote,
        updated_at: now,
      });
      expect(inserted.error).toBeNull();
      const login = await page.request.post("/api/auth", {
        headers: origin,
        data: { action: "login", email: company.email, password },
      });
      expect(login.status()).toBe(200);

      const created = await page.request.post("/api/room-scans", {
        headers: origin,
        data: { quoteId },
      });
      expect(created.status()).toBe(201);
      const createdSession = await created.json();
      const launch = new URL(createdSession.launchUrl);
      expect(launch.pathname).toMatch(/^\/room-scan\/[A-Za-z0-9_-]{40,80}$/);
      expect(createdSession.appUrl).toMatch(
        /^premiumremodelfield:\/\/room-scan\?/,
      );
      const token = launch.pathname.split("/").at(-1);
      expect(token).toMatch(/^[A-Za-z0-9_-]{40,80}$/);
      const capturePath = `/api/room-scans/capture/${token}`;
      const captureSession = await page.request.get(capturePath);
      expect(captureSession.status()).toBe(200);
      const session = await captureSession.json();
      expect(session.quote).toMatchObject({
        name: quote.name,
        address: quote.address,
      });
      expect(session.completed).toBe(false);

      const png = await sharp({
        create: {
          width: 640,
          height: 360,
          channels: 3,
          background: "#eef3f7",
        },
      })
        .png()
        .toBuffer();
      const uploadHeaders = session.uploads.headers as Record<string, string>;
      const [modelUpload, previewUpload] = await Promise.all([
        fetch(session.uploads.model.url, {
          method: "PUT",
          headers: {
            ...uploadHeaders,
            "Content-Type": session.uploads.model.contentType,
          },
          body: Buffer.from("test-usdz-model"),
        }),
        fetch(session.uploads.preview.url, {
          method: "PUT",
          headers: {
            ...uploadHeaders,
            "Content-Type": session.uploads.preview.contentType,
          },
          body: png,
        }),
      ]);
      expect(modelUpload.ok).toBe(true);
      expect(previewUpload.ok).toBe(true);

      const capture = {
        schemaVersion: 1,
        roomName: "Primary bathroom",
        capturedAt: now,
        device: {
          model: "iPhone Pro",
          systemName: "iOS",
          systemVersion: "18.0",
        },
        measurements: {
          floorAreaSqFt: 96.4,
          wallAreaSqFt: 328.2,
          ceilingHeightFt: 9,
          perimeterFt: 41.5,
          widthFt: 12.1,
          depthFt: 8,
          doors: 1,
          windows: 1,
          openings: 0,
        },
        surfaces: [
          {
            id: randomUUID(),
            kind: "wall",
            widthFt: 12.1,
            heightFt: 9,
            depthFt: 0.2,
            confidence: "high",
          },
          ...(["bathtub", "toilet", "sink", "cabinet"] as const).map(
            (category) => ({
              id: randomUUID(),
              kind: "object" as const,
              category,
              widthFt: category === "bathtub" ? 5 : 2.5,
              heightFt: category === "cabinet" ? 3 : 2,
              depthFt: 2,
              confidence: "high" as const,
            }),
          ),
        ],
      };
      const finalized = await page.request.post(capturePath, { data: capture });
      expect(finalized.status()).toBe(201);
      const saved = await finalized.json();
      expect(saved).toMatchObject({
        quoteId,
        roomName: "Primary bathroom",
        measurements: { floorAreaSqFt: 96.4 },
        detectedObjects: [
          { category: "bathtub", count: 1 },
          { category: "cabinet", count: 1 },
          { category: "sink", count: 1 },
          { category: "toilet", count: 1 },
        ],
      });

      const listed = await page.request.get(
        `/api/room-scans?quoteId=${quoteId}`,
      );
      expect(listed.status()).toBe(200);
      expect((await listed.json()).scans).toHaveLength(1);
      const stored = await company.admin
        .from("remodel_room_scans")
        .select("organization_id,quote_id,model_path,preview_path")
        .eq("id", saved.id)
        .single();
      expect(stored.error).toBeNull();
      expect(stored.data).toMatchObject({
        organization_id: company.organizationId,
        quote_id: quoteId,
      });
      expect(stored.data!.model_path).toMatch(
        new RegExp(`^${company.organizationId}/${quoteId}/room-scans/`),
      );

      await page.goto(`/?view=Quotes&project=${quoteId}`);
      const scans = page.getByRole("region", { name: "Room scans" });
      await expect(scans).toContainText("Primary bathroom");
      await expect(scans).toContainText("96.4 sq ft");
      await expect(scans).toContainText("Detected fixtures & objects");
      await expect(scans).toContainText("Bathtub");
      await expect(scans).toContainText("Toilet");
      await expect(scans).toContainText("Sink");
      await expect(scans).toContainText("Cabinet");
      await expect(
        scans.getByRole("img", { name: /Floor plan/ }),
      ).toBeVisible();

      const removed = await page.request.delete(`/api/room-scans/${saved.id}`, {
        headers: origin,
      });
      expect(removed.status()).toBe(200);
      expect(
        (
          await company.admin
            .from("remodel_room_scans")
            .select("id")
            .eq("id", saved.id)
        ).data,
      ).toEqual([]);
    } finally {
      await company.admin
        .from("remodel_records")
        .delete()
        .eq("organization_id", company.organizationId)
        .eq("id", quoteId);
    }
  },
);
