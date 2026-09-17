const app = require("./app");

const PORT = process.env.PORT || 4003;

async function startServer() {
  try {
    console.log("[SERVER] Starting service service...");

    app.listen(PORT, () => {
      console.log(`[SERVER] Service service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[SERVER] Service service startup failed");

    console.error(error);

    process.exit(1);
  }
}

startServer();
