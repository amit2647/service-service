const pool = require("../config/database");

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'Active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT services_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE,

      CONSTRAINT services_organization_name_unique
        UNIQUE (organization_id, name)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_services_organization_id
    ON services(organization_id);
  `);

  const result = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM services
  `);

  if (result.rows[0].count === 0) {
    /*
     * The application expects an existing organization.
     * Seed data into organization 1 for the MVP.
     */
    await pool.query(`
      INSERT INTO services
        (
          organization_id,
          name,
          description,
          category,
          status
        )
      VALUES
        (
          1,
          'CRM Implementation',
          'Customer relationship management implementation and customization',
          'Technology',
          'Active'
        ),
        (
          1,
          'Cloud Migration',
          'Cloud migration, modernization and infrastructure services',
          'Cloud',
          'Active'
        ),
        (
          1,
          'Data Analytics',
          'Business intelligence, reporting and analytics',
          'Data',
          'Active'
        ),
        (
          1,
          'IT Support',
          'Technical support and managed IT services',
          'Support',
          'Active'
        ),
        (
          1,
          'Consulting',
          'Business and technology consulting services',
          'Consulting',
          'Active'
        )
      ON CONFLICT (organization_id, name) DO NOTHING;
    `);

    console.log("Initial services created");
  }

  console.log("Service table ready");
}

module.exports = initializeDatabase;
