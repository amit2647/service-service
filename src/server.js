const app = require("./app");
const initializeDatabase = require("./db/initialize");

const PORT = process.env.PORT || 4003;

async function startServer() {
  try {
    console.log("[SERVER] Starting service service...");

    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`[SERVER] Service service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[SERVER] Database initialization failed");

    console.error(error);

    process.exit(1);
  }
}

startServer();
