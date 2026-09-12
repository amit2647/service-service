const express = require("express");
const cors = require("cors");

const serviceRoutes = require("./routes/serviceRoutes");
const requestLogger = require("./middleware/requestLogger");

const app = express();

app.use(cors());
app.use(express.json());

app.use(requestLogger);

app.use(serviceRoutes);

module.exports = app;
