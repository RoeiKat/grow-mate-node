const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const userDeviceRoutes = require("./routes/device.routes");
const deviceClientRoutes = require("./routes/deviceClient.routes");
const commandRoutes = require("./routes/command.routes");
const { notFound } = require("./middleware/notFound");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked this origin"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || "development" });
});

app.use("/api/auth", authRoutes);
app.use("/api/devices", userDeviceRoutes);
app.use("/api/device-client", deviceClientRoutes);
app.use("/api/commands", commandRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;