const { describe, test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

/*
 * The permission convention from CLAUDE.md, checked on the real routes:
 * GET /services/:id is open to anyone who can read leads or customers (those
 * services resolve service names with the end user's token), while the catalog
 * list GET /services stays on services.read alone.
 */

process.env.JWT_SECRET = "unit-test-secret";
process.env.JWT_ISSUER = "unit-test-issuer";

const SERVICE_ROW = { id: 1, organization_id: 3, name: "CRM Implementation", status: "Active" };

// Every query answers with one service row and no access grants.
const pool = require("../src/config/database");

pool.query = async (text) =>
  /access_grants/.test(text) ? { rows: [] } : { rows: [SERVICE_ROW], rowCount: 1 };

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

function tokenWith(permissions) {
  return jwt.sign(
    { sub: 7, organizationId: 3, role: "TEST", permissions },
    process.env.JWT_SECRET,
    { issuer: process.env.JWT_ISSUER, expiresIn: "5m" },
  );
}

async function get(path, permissions) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${tokenWith(permissions)}` },
  });

  return response.status;
}

describe("GET /services/:id", () => {
  for (const permission of ["services.read", "leads.read", "customers.read"]) {
    test(`is allowed with ${permission}`, async () => {
      assert.equal(await get("/services/1", [permission]), 200);
    });
  }

  test("is refused without any of them", async () => {
    assert.equal(await get("/services/1", ["reports.read"]), 403);
  });
});

describe("GET /services (the catalog)", () => {
  test("is allowed with services.read", async () => {
    assert.equal(await get("/services", ["services.read"]), 200);
  });

  test("is refused to someone who can only read leads", async () => {
    assert.equal(await get("/services", ["leads.read", "customers.read"]), 403);
  });
});

test("every route requires a token", async () => {
  const response = await fetch(`${base}/services`);

  assert.equal(response.status, 401);
});
