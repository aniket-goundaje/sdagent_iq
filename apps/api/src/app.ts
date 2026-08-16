import cors from "cors";
import express from "express";
import morgan from "morgan";

import { registerRoutes } from "./routes/index.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  registerRoutes(app);

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(error.message);
    res.status(500).json({
      type: "error",
      status: 500,
      error: {
        type: "internal_error",
        message: "Unexpected server error."
      }
    });
  });

  return app;
}
