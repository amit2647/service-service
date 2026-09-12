const pool = require("../config/database");

/*
 * =========================================================
 * GET ALL SERVICES
 * =========================================================
 */

async function getAllServices(organizationId, search) {
  let result;

  if (search) {
    result = await pool.query(
      `
      SELECT
        id,
        organization_id,
        name,
        description,
        category,
        status,
        created_at,
        updated_at
      FROM services
      WHERE organization_id = $1
        AND status <> 'Inactive'
        AND (
          name ILIKE $2
          OR description ILIKE $2
          OR category ILIKE $2
        )
      ORDER BY id DESC
      `,
      [organizationId, `%${search}%`],
    );
  } else {
    result = await pool.query(
      `
      SELECT
        id,
        organization_id,
        name,
        description,
        category,
        status,
        created_at,
        updated_at
      FROM services
      WHERE organization_id = $1
        AND status <> 'Inactive'
      ORDER BY id DESC
      `,
      [organizationId],
    );
  }

  return result.rows;
}

/*
 * =========================================================
 * GET SERVICE BY ID
 * =========================================================
 *
 * Returns both Active and Inactive services.
 *
 * This is intentional.
 *
 * Existing Lead/Customer relationships may reference an
 * inactive service. Those relationships must still be
 * resolvable.
 * =========================================================
 */

async function getServiceById(serviceId, organizationId) {
  const result = await pool.query(
    `
    SELECT
      id,
      organization_id,
      name,
      description,
      category,
      status,
      created_at,
      updated_at
    FROM services
    WHERE id = $1
      AND organization_id = $2
    `,
    [serviceId, organizationId],
  );

  if (result.rows.length === 0) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

/*
 * =========================================================
 * GET ACTIVE SERVICE BY ID
 * =========================================================
 *
 * Used when another service wants to CREATE or UPDATE a
 * relationship to a service.
 *
 * Inactive services cannot be newly assigned.
 *
 * This function intentionally differs from getServiceById():
 *
 * - getServiceById()       -> Active + Inactive
 * - getActiveServiceById() -> Active only
 * =========================================================
 */

async function getActiveServiceById(serviceId, organizationId) {
  const result = await pool.query(
    `
    SELECT
      id,
      organization_id,
      name,
      description,
      category,
      status,
      created_at,
      updated_at
    FROM services
    WHERE id = $1
      AND organization_id = $2
      AND status = 'Active'
    `,
    [serviceId, organizationId],
  );

  if (result.rows.length === 0) {
    const existingResult = await pool.query(
      `
      SELECT
        id,
        organization_id,
        name,
        description,
        category,
        status,
        created_at,
        updated_at
      FROM services
      WHERE id = $1
        AND organization_id = $2
      `,
      [serviceId, organizationId],
    );

    if (existingResult.rows.length === 0) {
      const error = new Error("Service not found");
      error.statusCode = 404;
      throw error;
    }

    const inactiveError = new Error(`Service ${serviceId} is inactive`);

    inactiveError.statusCode = 409;

    throw inactiveError;
  }

  return result.rows[0];
}

/*
 * =========================================================
 * CREATE SERVICE
 * =========================================================
 */

async function createService(data) {
  try {
    const result = await pool.query(
      `
      INSERT INTO services
        (
          organization_id,
          name,
          description,
          category,
          status
        )
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        data.organizationId,
        data.name.trim(),
        data.description || null,
        data.category || null,
        data.status || "Active",
      ],
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const duplicateError = new Error(
        "Service already exists in this organization",
      );

      duplicateError.statusCode = 409;

      throw duplicateError;
    }

    throw error;
  }
}

/*
 * =========================================================
 * UPDATE SERVICE
 * =========================================================
 */

async function updateService(serviceId, organizationId, data) {
  try {
    const result = await pool.query(
      `
      UPDATE services
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        status = COALESCE($4, status),
        updated_at = NOW()
      WHERE id = $5
        AND organization_id = $6
      RETURNING *
      `,
      [
        data.name ? data.name.trim() : null,
        data.description !== undefined ? data.description : null,
        data.category !== undefined ? data.category : null,
        data.status || null,
        serviceId,
        organizationId,
      ],
    );

    if (result.rows.length === 0) {
      const error = new Error("Service not found");
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const duplicateError = new Error(
        "Service already exists in this organization",
      );

      duplicateError.statusCode = 409;

      throw duplicateError;
    }

    throw error;
  }
}

/*
 * =========================================================
 * DELETE SERVICE
 * =========================================================
 *
 * Services are soft-deleted by changing their status to
 * Inactive.
 *
 * This preserves service references held by Lead Service
 * and Customer Service.
 *
 * There are intentionally no cross-service database
 * foreign keys from lead_services/customer_services to
 * services.
 * =========================================================
 */

async function deleteService(serviceId, organizationId) {
  const result = await pool.query(
    `
    UPDATE services
    SET
      status = 'Inactive',
      updated_at = NOW()
    WHERE id = $1
      AND organization_id = $2
      AND status <> 'Inactive'
    RETURNING
      id,
      organization_id,
      name,
      description,
      category,
      status,
      created_at,
      updated_at
    `,
    [serviceId, organizationId],
  );

  /*
   * Service was successfully deactivated.
   */
  if (result.rows.length > 0) {
    return {
      message: "Service deactivated",
      service: result.rows[0],
    };
  }

  /*
   * The UPDATE did not affect a row.
   *
   * Determine whether the service does not exist or is
   * already inactive.
   */
  const existing = await pool.query(
    `
    SELECT
      id,
      organization_id,
      name,
      description,
      category,
      status,
      created_at,
      updated_at
    FROM services
    WHERE id = $1
      AND organization_id = $2
    `,
    [serviceId, organizationId],
  );

  if (existing.rows.length === 0) {
    const error = new Error("Service not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    message: "Service already inactive",
    service: existing.rows[0],
  };
}

/*
 * =========================================================
 * HEALTH
 * =========================================================
 */

async function checkHealth() {
  await pool.query("SELECT 1");

  return {
    service: "service-service",
    status: "ok",
    database: "postgresql",
  };
}

module.exports = {
  getAllServices,
  getServiceById,
  getActiveServiceById,
  createService,
  updateService,
  deleteService,
  checkHealth,
};
