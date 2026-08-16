import type { Express } from "express";

import type { ChatQueryRequest, RecentQuestion } from "@sd-agent-iq/shared";

import { buildChatResponse } from "./chat.service.js";

const recentQuestions: RecentQuestion[] = [
  {
    id: "recent-1",
    question: "Where do I send my timesheet?",
    askedAt: "2026-08-16T09:30:00.000Z"
  },
  {
    id: "recent-2",
    question: "What is paid sick leave?",
    askedAt: "2026-08-16T09:45:00.000Z"
  }
];

export function registerChatRoutes(app: Express) {
  app.get("/api/chat/recent", (_req, res) => {
    res.json({ items: recentQuestions });
  });

  app.get("/api/chat/common", (_req, res) => {
    res.json({
      items: [
        "Where do I send my timesheet?",
        "How do I reset my ESP password?",
        "What is paid sick leave?",
        "How do I check payment status?"
      ]
    });
  });

  app.post("/api/chat/query", async (req, res, next) => {
    const body = req.body as Partial<ChatQueryRequest>;
    try {
      const response = await buildChatResponse(body.question ?? "", body.selectedScenarioId ?? null);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });
}
