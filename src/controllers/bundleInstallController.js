const bundleInstallService = require("../services/bundleInstallService");

const KEY = /^[a-z][a-z0-9-]{1,59}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

/*
 * The catalog step of a bundle install, called by bundle-service with the
 * installing admin's token.
 */
async function installCatalog(req, res) {
  try {
    const { key, version } = req.params;

    if (!KEY.test(key) || !VERSION.test(version)) {
      return res.status(400).json({ error: "Invalid bundle key or version" });
    }

    const catalog = req.body || {};

    if (!Array.isArray(catalog.services)) {
      return res.status(400).json({ error: "services must be a list" });
    }

    const summary = await bundleInstallService.installCatalog(req.auth.organizationId, key, version, catalog);

    return res.json(summary);
  } catch (error) {
    console.error("[Bundle Install] catalog:", error.message);

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Catalog install failed",
    });
  }
}

module.exports = { installCatalog };
