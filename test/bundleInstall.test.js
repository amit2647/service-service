const { describe, test, beforeEach, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

/*
 * The catalog step of a bundle install, against an in-memory stand-in for
 * the database: new services are created with their keys, a seeded service
 * with the same name is adopted rather than duplicated, and items the bundle
 * dropped are retired.
 */

process.env.JWT_SECRET = "unit-test-secret";
process.env.JWT_ISSUER = "unit-test-issuer";

const pool = require("../src/config/database");

let statements;
let rows; // services/packages already in the organization, by table

function fakeClient() {
  return {
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, " ").trim();
      statements.push({ sql, params });

      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return {};

      const select = /^SELECT \* FROM (services|service_packages) WHERE/.exec(sql);
      if (select) {
        const [, key, name] = params;
        const row = rows[select[1]].find((item) => item.key === key || (item.key == null && item.name === name));
        return { rows: row ? [row] : [] };
      }

      if (/^SELECT id FROM service_packages/.test(sql)) return { rows: [] };
      if (/^INSERT INTO services /.test(sql)) return { rows: [{ id: 100 + statements.length }] };
      if (/^INSERT INTO service_packages /.test(sql)) return { rows: [{ id: 500 }] };
      if (/SET retired_at = NOW\(\)/.test(sql)) return { rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
}

pool.connect = async () => fakeClient();
pool.query = async (text) => (/access_grants/.test(text) ? { rows: [] } : { rows: [] });

const { installCatalog } = require("../src/services/bundleInstallService");

const CATALOG = {
  groups: [{ key: "audit", label: "Audit" }],
  services: [
    { key: "statutory_audit", name: "Statutory Audit", group: "audit" },
    { key: "tax_audit", name: "Tax Audit", group: "audit" },
  ],
  packages: [{ key: "audits", name: "Audits", services: ["statutory_audit", "tax_audit"] }],
};

beforeEach(() => {
  statements = [];
  rows = { services: [], service_packages: [] };
});

const find = (pattern) => statements.filter((statement) => pattern.test(statement.sql));

describe("installCatalog", () => {
  test("creates each service with its key, and the package with its items", async () => {
    const summary = await installCatalog(3, "ca-practice", "0.1.0", CATALOG);

    assert.equal(summary.inserted, 3);

    const inserts = find(/^INSERT INTO services /);

    assert.deepEqual(inserts.map((insert) => insert.params.slice(0, 7)), [
      [3, "Statutory Audit", null, "Audit", "statutory_audit", "ca-practice", "0.1.0"],
      [3, "Tax Audit", null, "Audit", "tax_audit", "ca-practice", "0.1.0"],
    ]);
    assert.equal(find(/^INSERT INTO service_package_items/).length, 1);
  });

  test("adopts a service of the same name instead of duplicating it, keeping its wording", async () => {
    rows.services.push({ id: 7, key: null, name: "Tax Audit", description: "Our own description", category: "Tax", source_checksum: null });

    const summary = await installCatalog(3, "ca-practice", "0.1.0", CATALOG);

    assert.equal(summary.kept, 1);
    assert.equal(find(/^INSERT INTO services /).length, 1);
    assert.equal(find(/^UPDATE services SET name/).length, 0);

    const adopt = find(/^UPDATE services SET key = \$1, bundle_key = \$2, retired_at = NULL/)[0];

    assert.deepEqual(adopt.params.slice(0, 6), ["tax_audit", "ca-practice", true, "0.1.0", 7, false]);
  });

  test("reports what it keeps as the firm's, beside what the bundle ships", async () => {
    rows.services.push({ id: 7, key: null, name: "Tax Audit", description: "Our own description", category: "Tax", source_checksum: null });

    const summary = await installCatalog(3, "ca-practice", "0.1.0", CATALOG);

    assert.deepEqual(summary.customized, [{
      kind: "service",
      key: "tax_audit",
      name: "Tax Audit",
      mine: { name: "Tax Audit", description: "Our own description", category: "Tax" },
      theirs: { name: "Tax Audit", description: null, category: "Audit" },
      version: "0.1.0",
    }]);
  });

  test("accepting an item takes the bundle's version over the firm's", async () => {
    rows.services.push({ id: 7, key: null, name: "Tax Audit", description: "Our own description", category: "Tax", source_checksum: null });

    const summary = await installCatalog(3, "ca-practice", "0.1.0", CATALOG, { accept: new Set(["service:tax_audit"]) });

    assert.equal(summary.updated, 1);
    assert.deepEqual(find(/^UPDATE services SET name/)[0].params, ["Tax Audit", null, "Audit", 7]);
    assert.deepEqual(summary.customized, []);
  });

  test("dismissing keeps the firm's version and records the bundle version as seen", async () => {
    rows.services.push({ id: 7, key: null, name: "Tax Audit", description: "Our own description", category: "Tax", source_checksum: null });

    const summary = await installCatalog(3, "ca-practice", "0.1.0", CATALOG, { dismiss: new Set(["service:tax_audit"]) });
    const keep = find(/^UPDATE services SET key = \$1, bundle_key = \$2, retired_at = NULL/)[0];

    assert.equal(find(/^UPDATE services SET name/).length, 0);
    assert.equal(keep.params[5], true);
    assert.match(keep.params[6], /^[0-9a-f]{64}$/);
    assert.deepEqual(summary.customized, []);
  });

  test("a dry run does the work and rolls it back", async () => {
    await installCatalog(3, "ca-practice", "0.1.0", CATALOG, { dryRun: true });

    assert.equal(find(/^ROLLBACK/).length, 1);
    assert.equal(find(/^COMMIT/).length, 0);
  });

  test("retires what the bundle no longer ships, never deletes it", async () => {
    await installCatalog(3, "ca-practice", "0.1.0", CATALOG);

    const retire = find(/^UPDATE services SET retired_at = NOW\(\)/)[0];

    assert.deepEqual(retire.params, [3, "ca-practice", ["statutory_audit", "tax_audit"]]);
    assert.equal(find(/^DELETE FROM services/).length, 0);
  });
});

describe("route", () => {
  const app = require("../src/app");
  let server;
  let base;

  before(async () => {
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  const put = (path, permissions, body = CATALOG) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt.sign({ sub: 1, organizationId: 3, role: "X", permissions }, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER })}`,
      },
      body: JSON.stringify(body),
    });

  test("needs bundles.manage", async () => {
    assert.equal((await put("/services/bundles/ca-practice/0.1.0", ["services.update"])).status, 403);
  });

  test("refuses a body without a services list", async () => {
    assert.equal((await put("/services/bundles/ca-practice/0.1.0", ["bundles.manage"], {})).status, 400);
  });

  test("installs with bundles.manage", async () => {
    const response = await put("/services/bundles/ca-practice/0.1.0", ["bundles.manage"]);

    assert.equal(response.status, 200);
    assert.equal((await response.json()).inserted, 3);
  });
});
