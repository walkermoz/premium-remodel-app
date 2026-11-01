import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("two database tenants complete isolated lead, quote, agreement, and payment setup", async () => {
  test.skip(!databaseUrl, "Set TEST_DATABASE_URL to an isolated migrated database.");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("begin");
  try {
    const organizationA = randomUUID();
    const organizationB = randomUUID();
    await client.query(
      "insert into public.organizations(id,name) values ($1,$2),($3,$4)",
      [
        organizationA,
        "Synthetic Alpha Services",
        organizationB,
        "Synthetic Beta Services",
      ],
    );

    const recordIds = {
      contactA: randomUUID(),
      leadA: randomUUID(),
      quoteA: randomUUID(),
      contactB: randomUUID(),
      leadB: randomUUID(),
      quoteB: randomUUID(),
    };
    const now = new Date().toISOString();
    for (const [organizationId, suffix] of [
      [organizationA, "A"],
      [organizationB, "B"],
    ] as const) {
      const contactId = recordIds[`contact${suffix}`];
      const leadId = recordIds[`lead${suffix}`];
      const quoteId = recordIds[`quote${suffix}`];
      for (const [id, kind, data] of [
        [contactId, "contact", { id: contactId, name: `Client ${suffix}` }],
        [
          leadId,
          "lead",
          { id: leadId, contactId, name: `Lead ${suffix}`, status: "New" },
        ],
        [
          quoteId,
          "quote",
          { id: quoteId, contactId, name: `Quote ${suffix}`, status: "Draft" },
        ],
      ] as const)
        await client.query(
          `insert into public.remodel_records
            (id,organization_id,kind,project_id,data,updated_at)
           values ($1,$2,$3,null,$4,$5)`,
          [id, organizationId, kind, { ...data, updatedAt: now }, now],
        );
    }

    const templateA = randomUUID();
    const templateB = randomUUID();
    const roles = [
      {
        id: "customer",
        label: "Customer",
        partyType: "customer",
        order: 1,
        required: true,
        nameBinding: "contact.name",
        emailBinding: "contact.email",
      },
    ];
    const fields = [
      {
        id: "customer_signature",
        label: "Customer signature",
        type: "signature",
        required: true,
        bindingKey: null,
        signerRoleId: "customer",
        page: null,
        x: null,
        y: null,
        width: null,
        height: null,
        placeholder: null,
      },
    ];
    for (const [organizationId, templateId, suffix] of [
      [organizationA, templateA, "A"],
      [organizationB, templateB, "B"],
    ] as const) {
      await client.query(
        `insert into public.remodel_agreement_templates
          (id,organization_id,name,source_type,status,content,fields,signer_roles)
         values ($1,$2,$3,'servicebuddy_document','draft',$4,$5,$6)`,
        [
          templateId,
          organizationId,
          `Agreement ${suffix}`,
          JSON.stringify({ title: `Agreement ${suffix}`, blocks: [] }),
          JSON.stringify(fields),
          JSON.stringify(roles),
        ],
      );
      const published = await client.query(
        "select public.remodel_publish_agreement_template($1,$2,0,null,'Synthetic tenant test') as result",
        [organizationId, templateId],
      );
      expect(published.rows[0].result.version).toBe(1);
    }

    const packetA = randomUUID();
    const packetB = randomUUID();
    for (const [organizationId, templateId, packetId, quoteId, suffix] of [
      [organizationA, templateA, packetA, recordIds.quoteA, "A"],
      [organizationB, templateB, packetB, recordIds.quoteB, "B"],
    ] as const)
      await client.query(
        `insert into public.remodel_agreement_packets
          (id,organization_id,template_id,template_version,project_id,status,template_snapshot,data_snapshot)
         values ($1,$2,$3,1,$4,'sent',$5,$6)`,
        [
          packetId,
          organizationId,
          templateId,
          quoteId,
          { name: `Agreement ${suffix}`, fields, signerRoles: roles },
          { quote: { id: quoteId }, organization: { name: `Synthetic ${suffix}` } },
        ],
      );

    const signerA = randomUUID();
    const signerB = randomUUID();
    for (const [organizationId, packetId, signerId, suffix] of [
      [organizationA, packetA, signerA, "A"],
      [organizationB, packetB, signerB, "B"],
    ] as const) {
      await client.query(
        `insert into public.remodel_agreement_signers
          (id,organization_id,packet_id,role_id,role_label,party_type,signing_order,name,email)
         values ($1,$2,$3,'customer','Customer','customer',1,$4,$5)`,
        [signerId, organizationId, packetId, `Client ${suffix}`, `client${suffix.toLowerCase()}@example.test`],
      );
      await client.query(
        `insert into public.remodel_agreement_field_values
          (organization_id,packet_id,field_id,signer_id,value)
         values ($1,$2,'customer_signature',$3,$4)`,
        [organizationId, packetId, signerId, { signedName: `Client ${suffix}` }],
      );
      await client.query(
        `insert into public.remodel_payment_connections
          (organization_id,provider,connection_mode,status,external_account_id,display_name)
         values ($1,'stripe','stripe_connect','active',$2,$3)`,
        [organizationId, `acct_synthetic_${suffix.toLowerCase()}`, `Payments ${suffix}`],
      );
    }

    const tenantCounts = await client.query(
      `select organization_id, count(*)::int as count
       from public.remodel_records
       where organization_id in ($1,$2)
       group by organization_id`,
      [organizationA, organizationB],
    );
    expect(tenantCounts.rows).toEqual(
      expect.arrayContaining([
        { organization_id: organizationA, count: 3 },
        { organization_id: organizationB, count: 3 },
      ]),
    );

    await client.query("savepoint cross_tenant_packet");
    let packetError = "";
    try {
      await client.query(
        `insert into public.remodel_agreement_packets
          (organization_id,template_id,template_version,status,template_snapshot)
         values ($1,$2,1,'sent','{}'::jsonb)`,
        [organizationA, templateB],
      );
    } catch (error) {
      packetError = (error as { code?: string }).code || "";
    }
    await client.query("rollback to savepoint cross_tenant_packet");
    expect(packetError).toBe("23503");

    await client.query("savepoint reused_processor");
    let processorError = "";
    try {
      await client.query(
        `insert into public.remodel_payment_connections
          (organization_id,provider,connection_mode,status,external_account_id)
         values ($1,'stripe','stripe_connect','active','acct_synthetic_a')`,
        [organizationB],
      );
    } catch (error) {
      processorError = (error as { code?: string }).code || "";
    }
    await client.query("rollback to savepoint reused_processor");
    expect(processorError).toBe("23505");

    const betaData = await client.query(
      `select data::text from public.remodel_records where organization_id = $1
       union all
       select template_snapshot::text from public.remodel_agreement_packets where organization_id = $1`,
      [organizationB],
    );
    expect(betaData.rows.map((row) => row.data).join("\n")).not.toContain(
      "Synthetic Alpha",
    );
  } finally {
    await client.query("rollback");
    await client.end();
  }
});
