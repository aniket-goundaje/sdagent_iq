import type { Express } from "express";

import type { ChatQueryRequest, ChatQueryResponse, RecentQuestion } from "@sd-agent-iq/shared";

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

  app.post("/api/chat/query", (req, res) => {
    const body = req.body as Partial<ChatQueryRequest>;
    const question = (body.question ?? "").trim();

    const response: ChatQueryResponse = {
      question,
      selectedScenarioId: body.selectedScenarioId ?? null,
      sayThisToCaller: question
        ? "This is a placeholder grounded response. The Scripts PDF parser and retrieval layer will replace this text in the next slice."
        : "Please enter a question so the service can search the latest scripts.",
      notes: [
        "Notes will come from the Scripts PDF note column.",
        "This response is a shell endpoint for wiring the UI."
      ],
      steps: [
        "Parse Scripts PDF rows.",
        "Index script and note fields.",
        "Return grounded content from retrieval."
      ],
      referenceScreenshots: [],
      citations: [
        {
          label: "Scripts PDF",
          sourceType: "scripts_pdf",
          page: 1
        }
      ],
      cacheHit: false
    };

    res.json(response);
  });
}
