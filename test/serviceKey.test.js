const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { keyBase } = require("../src/services/serviceService");

/*
 * A firm's own service gets a key like a bundle's, so deadline rules can
 * attach to it: lower case, underscores, starting with a letter.
 */
describe("service keys", () => {
  test("come from the name", () => {
    assert.equal(keyBase("GST Returns"), "gst_returns");
    assert.equal(keyBase("  PF & ESIC  "), "pf_esic");
    assert.equal(keyBase("GSTR-9C Reconciliation"), "gstr_9c_reconciliation");
  });

  test("always start with a letter and match the bundle key pattern", () => {
    for (const name of ["26AS review", "#1 Audit", "A", "!!!", "x".repeat(80)]) {
      assert.match(keyBase(name), /^[a-z][a-z0-9_]{1,59}$/, name);
    }
  });
});
