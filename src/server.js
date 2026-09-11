const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "customer_management",
  user: process.env.DB_USER || "app_user",
  password: process.env.DB_PASSWORD || "app_password",
});

/*
 * Initialize database
 */
async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      category VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  /*
   * Seed initial services
   */
  const result = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM services
  `);

  if (result.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO services
        (name, description, category, status)
      VALUES
        (
          'CRM Implementation',
          'Customer relationship management implementation and customization',
          'Technology',
          'Active'
        ),
        (
          'Cloud Migration',
          'Cloud migration, modernization and infrastructure services',
          'Cloud',
          'Active'
        ),
        (
          'Data Analytics',
          'Business intelligence, reporting and analytics',
          'Data',
          'Active'
        ),
        (
          'IT Support',
          'Technical support and managed IT services',
          'Support',
          'Active'
        ),
        (
          'Consulting',
          'Business and technology consulting services',
          'Consulting',
          'Active'
        )
    `);

    console.log("Initial services created");
  }

  console.log("Service table ready");
}

/*
 * Health
 */
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "service-service",
      status: "ok",
      database: "postgresql",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      service: "service-service",
      status: "error",
    });
  }
});

/*
 * Get services
 *
 * GET /services
 * GET /services?q=cloud
 */
app.get("/services", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    let result;

    if (q) {
      result = await pool.query(
        `
        SELECT *
        FROM services
        WHERE
          name ILIKE $1
          OR description ILIKE $1
          OR category ILIKE $1
        ORDER BY id DESC
        `,
        [`%${q}%`],
      );
    } else {
      result = await pool.query(`
        SELECT *
        FROM services
        ORDER BY id DESC
      `);
    }

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching services:", error);

    res.status(500).json({
      error: "Failed to fetch services",
    });
  }
});

/*
 * Get service
 */
app.get("/services/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM services
      WHERE id = $1
      `,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Service not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching service:", error);

    res.status(500).json({
      error: "Failed to fetch service",
    });
  }
});

/*
 * Create service
 */
app.post("/services", async (req, res) => {
  try {
    const { name, description, category, status = "Active" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Service name is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO services
        (name, description, category, status)
      VALUES
        ($1, $2, $3, $4)
      RETURNING *
      `,
      [name.trim(), description || null, category || null, status],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating service:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Service already exists",
      });
    }

    res.status(500).json({
      error: "Failed to create service",
    });
  }
});

/*
 * Update service
 */
app.put("/services/:id", async (req, res) => {
  try {
    const { name, description, category, status } = req.body;

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
      RETURNING *
      `,
      [
        name || null,
        description || null,
        category || null,
        status || null,
        req.params.id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Service not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating service:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Service already exists",
      });
    }

    res.status(500).json({
      error: "Failed to update service",
    });
  }
});

/*
 * Delete service
 */
app.delete("/services/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      DELETE FROM services
      WHERE id = $1
      RETURNING id
      `,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Service not found",
      });
    }

    res.json({
      message: "Service deleted",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error deleting service:", error);

    res.status(500).json({
      error: "Failed to delete service",
    });
  }
});

/*
 * Start service
 */
async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Service service running on port ${PORT}`);
      console.log("PostgreSQL database connected");
    });
  } catch (error) {
    console.error("Database initialization failed");
    console.error(error);

    process.exit(1);
  }
}

startServer();
