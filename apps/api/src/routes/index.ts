import type { Express } from "express";

import { registerAdminRoutes } from "../documents/admin.routes.js";
import { registerAuthRoutes } from "../auth/auth.routes.js";
import { registerChatRoutes } from "../chat/chat.routes.js";
import { registerHealthRoutes } from "./health.route.js";

export function registerRoutes(app: Express) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerChatRoutes(app);
  registerAdminRoutes(app);
}
