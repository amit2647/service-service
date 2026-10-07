const pool = require("../config/database");
const { customized, decide, optionsFor } = require("./bundleSync");

/*
 * The catalog step of a bundle install: the bundle's services and packages
 * become this organization's, matched by their stable `key` ("gst_returns").
 *
 * Follows bundleSync's rule, so a service the firm renamed or re-described is
 * kept as theirs. A service that already exists under the same name but was
 * not installed by the bundle (one of the seeded defaults, say) is adopted —
 * linked to the bundle key and treated as the firm's own — never duplicated.
 * Items the bundle stops shipping are retired, never deleted: customers and
 * leads may still reference them.
 *
 * The plain CRM's generic services, which the seed creates for every new
 * installation (seeded_default, migration 021), do not belong to a profession:
 * those nothing uses are removed, and any a lead, client, engagement or
 * deadline still points at are switched off instead. A default the bundle
 * adopted (it has a key) is the bundle's now and is left alone.
 */

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

// A dry run does all the work and rolls it back, to report what it would do.
async function inTransaction(work, { dryRun = false } = {}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw conflict("A catalog item with this name already belongs to something else");
    }

    throw error;
  } finally {
    client.release();
  }
}

async function upsert(client, { table, kind, choices, organizationId, bundleKey, version, item, content, insert, apply, summary }) {
  const found = await client.query(
    `SELECT * FROM ${table}
     WHERE organization_id = $1 AND (key = $2 OR (key IS NULL AND name = $3))
     ORDER BY key NULLS LAST
     LIMIT 1`,
    [organizationId, item.key, content.name],
  );

  const row = found.rows[0];
  const existing = row ? { content: content.current(row), sourceChecksum: row.source_checksum } : null;
  const shipped = content.shipped;
  const { action, shippedChecksum, flag, acknowledge } = decide(existing, shipped, optionsFor(choices, kind, item.key));

  if (action === "insert") {
    const id = await insert(shippedChecksum);
    summary.inserted += 1;
    return id;
  }

  if (action === "update") {
    await apply(row.id);
  }

  if (action === "keep") {
    // Dismissed: the firm keeps theirs and has seen this version (bundleSync).
    await client.query(
      `UPDATE ${table}
       SET key = $1, bundle_key = $2, retired_at = NULL,
           update_available_version = CASE WHEN $6 THEN NULL WHEN $3 THEN $4 ELSE update_available_version END,
           source_checksum = CASE WHEN $6 THEN $7 ELSE source_checksum END
       WHERE id = $5`,
      [item.key, bundleKey, flag, version, row.id, Boolean(acknowledge), shippedChecksum],
    );
    summary.kept += 1;
    if (flag) summary.customized.push(customized(kind, item.key, row.name, existing.content, shipped, version));
    return row.id;
  }

  await client.query(
    `UPDATE ${table}
     SET key = $1, bundle_key = $2, source_version = $3, source_checksum = $4,
         update_available_version = NULL, retired_at = NULL
     WHERE id = $5`,
    [item.key, bundleKey, version, shippedChecksum, row.id],
  );
  summary[action === "update" ? "updated" : "unchanged"] += 1;

  return row.id;
}

async function installCatalog(organizationId, bundleKey, version, catalog = {}, choices = {}) {
  const groups = new Map((catalog.groups || []).map((group) => [group.key, group.label]));
  const services = catalog.services || [];
  const packages = catalog.packages || [];

  return inTransaction(async (client) => {
    const summary = { inserted: 0, updated: 0, unchanged: 0, kept: 0, retired: 0, removedDefaults: 0, deactivatedDefaults: 0, customized: [] };
    const serviceIds = new Map();

    for (const service of services) {
      const shipped = {
        name: service.name,
        description: service.description || null,
        category: groups.get(service.group) || null,
      };

      const id = await upsert(client, {
        table: "services",
        kind: "service",
        choices,
        organizationId,
        bundleKey,
        version,
        item: service,
        summary,
        content: {
          name: shipped.name,
          shipped,
          current: (row) => ({ name: row.name, description: row.description || null, category: row.category || null }),
        },
        insert: async (checksum) => {
          const created = await client.query(
            `INSERT INTO services (organization_id, name, description, category, status,
                                   key, bundle_key, source_version, source_checksum)
             VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7, $8)
             RETURNING id`,
            [organizationId, shipped.name, shipped.description, shipped.category, service.key, bundleKey, version, checksum],
          );
          return created.rows[0].id;
        },
        apply: (id) =>
          client.query(
            "UPDATE services SET name = $1, description = $2, category = $3, updated_at = NOW() WHERE id = $4",
            [shipped.name, shipped.description, shipped.category, id],
          ),
      });

      serviceIds.set(service.key, id);
    }

    for (const pack of packages) {
      const shipped = {
        name: pack.name,
        description: pack.description || null,
        services: [...pack.services].sort(),
      };

      const setItems = async (packageId) => {
        await client.query("DELETE FROM service_package_items WHERE package_id = $1", [packageId]);
        await client.query(
          `INSERT INTO service_package_items (package_id, service_id)
           SELECT $1, UNNEST($2::int[]) ON CONFLICT DO NOTHING`,
          [packageId, shipped.services.map((key) => serviceIds.get(key)).filter(Boolean)],
        );
      };

      const currentItems = async (packageId) => {
        const items = await client.query(
          `SELECT s.key FROM service_package_items i JOIN services s ON s.id = i.service_id
           WHERE i.package_id = $1 ORDER BY s.key`,
          [packageId],
        );
        return items.rows.map((row) => row.key);
      };

      // Package content includes its items, which need a query to read.
      const found = await client.query(
        "SELECT id FROM service_packages WHERE organization_id = $1 AND (key = $2 OR (key IS NULL AND name = $3)) LIMIT 1",
        [organizationId, pack.key, pack.name],
      );
      const items = found.rows[0] ? await currentItems(found.rows[0].id) : [];

      await upsert(client, {
        table: "service_packages",
        kind: "package",
        choices,
        organizationId,
        bundleKey,
        version,
        item: pack,
        summary,
        content: {
          name: shipped.name,
          shipped,
          current: (row) => ({ name: row.name, description: row.description || null, services: items }),
        },
        insert: async (checksum) => {
          const created = await client.query(
            `INSERT INTO service_packages (organization_id, key, bundle_key, name, description,
                                           source_version, source_checksum)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [organizationId, pack.key, bundleKey, shipped.name, shipped.description, version, checksum],
          );
          await setItems(created.rows[0].id);
          return created.rows[0].id;
        },
        apply: async (id) => {
          await client.query(
            "UPDATE service_packages SET name = $1, description = $2, updated_at = NOW() WHERE id = $3",
            [shipped.name, shipped.description, id],
          );
          await setItems(id);
        },
      });
    }

    for (const [table, keys] of [
      ["services", services.map((service) => service.key)],
      ["service_packages", packages.map((pack) => pack.key)],
    ]) {
      const retired = await client.query(
        `UPDATE ${table} SET retired_at = NOW()
         WHERE organization_id = $1 AND bundle_key = $2 AND retired_at IS NULL
           AND key <> ALL($3::text[])`,
        [organizationId, bundleKey, keys],
      );
      summary.retired += retired.rowCount;
    }

    const removed = await client.query(
      `DELETE FROM services s
       WHERE s.organization_id = $1 AND s.seeded_default AND s.bundle_key IS NULL AND s.key IS NULL
         AND NOT EXISTS (SELECT 1 FROM lead_services x WHERE x.service_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM customer_services x WHERE x.service_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM engagement_lines x WHERE x.service_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM obligations x WHERE x.service_id = s.id)`,
      [organizationId],
    );
    const deactivated = await client.query(
      `UPDATE services SET status = 'Inactive', updated_at = NOW()
       WHERE organization_id = $1 AND seeded_default AND bundle_key IS NULL AND key IS NULL AND status <> 'Inactive'`,
      [organizationId],
    );
    summary.removedDefaults = removed.rowCount;
    summary.deactivatedDefaults = deactivated.rowCount;

    return summary;
  }, choices);
}

module.exports = { installCatalog };
