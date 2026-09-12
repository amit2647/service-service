const express = require("express");

const authenticate = require("../middleware/authenticate");
const requirePermission = require("../middleware/requirePermission");

const serviceController = require("../controllers/serviceController");

const router = express.Router();

/*
 * Health remains public.
 */
router.get("/health", serviceController.health);

/*
 * Service catalog
 */

router.get(
  "/services",
  authenticate,
  requirePermission("services.read"),
  serviceController.getServices,
);

router.get(
  "/services/:id",
  authenticate,
  requirePermission("services.read"),
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
