const serviceService = require("../services/serviceService");

/*
 * =========================================================
 * GET SERVICES
 * =========================================================
 */

async function getServices(req, res) {
  try {
    const search = (req.query.q || "").trim();

    const services = await serviceService.getAllServices(
      req.auth.organizationId,
      search,
    );

    res.json(services);
  } catch (error) {
    console.error("[ERROR] Error fetching services:", error);

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to fetch services",
    });
  }
}

/*
 * =========================================================
 * GET SERVICE
 * =========================================================
 */

async function getService(req, res) {
  try {
    const service = await serviceService.getServiceById(
      req.params.id,
      req.auth.organizationId,
    );

    res.json(service);
  } catch (error) {
    console.error("[ERROR] Error fetching service:", error);

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to fetch service",
    });
  }
}

/*
 * =========================================================
 * CREATE SERVICE
 * =========================================================
 */

async function createService(req, res) {
  try {
    const { name, description, category, status = "Active" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Service name is required",
      });
    }

    const service = await serviceService.createService({
      organizationId: req.auth.organizationId,
      name,
      description,
      category,
      status,
    });

    res.status(201).json(service);
  } catch (error) {
    console.error("[ERROR] Error creating service:", error);

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to create service",
    });
  }
}

/*
 * =========================================================
 * UPDATE SERVICE
 * =========================================================
 */

async function updateService(req, res) {
  try {
    const { name, description, category, status } = req.body;

    const service = await serviceService.updateService(
      req.params.id,
      req.auth.organizationId,
      {
        name,
        description,
        category,
        status,
      },
    );

    res.json(service);
  } catch (error) {
    console.error("[ERROR] Error updating service:", error);

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to update service",
    });
  }
}

/*
 * =========================================================
 * DELETE SERVICE
 * =========================================================
 */

async function deleteService(req, res) {
  try {
    const result = await serviceService.deleteService(
      req.params.id,
      req.auth.organizationId,
    );

    res.json(result);
  } catch (error) {
    console.error("[ERROR] Error deleting service:", error);

    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Failed to delete service",
    });
  }
}

/*
 * =========================================================
 * HEALTH
 * =========================================================
 */

async function health(req, res) {
  try {
    const result = await serviceService.checkHealth();

    res.json(result);
  } catch (error) {
    console.error("[ERROR] Service health check failed:", error);

    res.status(500).json({
      service: "service-service",
      status: "error",
    });
  }
}

module.exports = {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  health,
};
