const express = require("express");

const bundleInstallController = require("../controllers/bundleInstallController");

const authenticate = require("../middleware/authenticate");
const requirePermission = require("../middleware/requirePermission");
const requireAnyPermission = require("../middleware/requireAnyPermission");

const serviceController = require("../controllers/serviceController");

const router = express.Router();

/*
 * Health remains public.
 */
router.get("/health", serviceController.health);

/*
 * The catalog step of a profession bundle install (bundle-service calls it
 * with the installing admin's token). Declared before /services/:id.
 */
router.put(
  "/services/bundles/:key/:version",
  authenticate,
  requirePermission("bundles.manage"),
  bundleInstallController.installCatalog,
);

/*
 * Service catalog
 */

router.get(
  "/services",
  authenticate,
  requirePermission("services.read"),
  serviceController.getServices,
);

/*
 * Reading one service is permitted to anyone who can read a lead or a customer:
 * lead-service and customer-service call this to name the services attached to
 * a record, and that same object is already embedded in what those callers
 * receive. The catalog list above stays on services.read alone — that is the
 * Services screen.
 */
router.get(
  "/services/:id",
  authenticate,
  requireAnyPermission("services.read", "leads.read", "customers.read"),
  serviceController.getService,
);

router.post(
  "/services",
  authenticate,
  requirePermission("services.create"),
  serviceController.createService,
);

router.put(
  "/services/:id",
  authenticate,
  requirePermission("services.update"),
  serviceController.updateService,
);

router.delete(
  "/services/:id",
  authenticate,
  requirePermission("services.delete"),
  serviceController.deleteService,
);

module.exports = router;
