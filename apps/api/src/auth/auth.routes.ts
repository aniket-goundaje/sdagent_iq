import type { Express } from "express";

import type { LoginRequest, LoginResponse, UserRole } from "@sd-agent-iq/shared";

import { env } from "../config/env.js";

const demoUsers = [
  {
    email: env.demoSupervisorEmail,
    password: env.demoSupervisorPassword,
    role: "supervisor" as UserRole,
    name: "Supervisor Demo"
  },
  {
    email: env.demoAgentEmail,
    password: env.demoAgentPassword,
    role: "agent" as UserRole,
    name: "Service Desk Demo"
  }
];

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", (req, res) => {
    const body = req.body as Partial<LoginRequest>;
    const identity = (body.email ?? "").toLowerCase().trim();
    const password = body.password ?? "";

    const match = demoUsers.find((user) => user.email.toLowerCase() === identity && user.password === password);

    if (!match) {
      res.status(401).json({
        type: "error",
        status: 401,
        error: {
          type: "authentication_error",
          message: "Invalid demo credentials."
        }
      });
      return;
    }

    const response: LoginResponse = {
      user: {
        id: match.role === "supervisor" ? "demo-supervisor" : "demo-agent",
        email: match.email,
        displayName: match.name,
        role: match.role
      },
      session: {
        accessToken: `${match.role}-session-token`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString()
      }
    };

    res.json(response);
  });
}
