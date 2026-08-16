import { CommonModule } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";

import type { ChatQueryResponse, CommonQuestionsResponse, ParsedScriptScenarioMatch, RecentQuestionsResponse } from "@sd-agent-iq/shared";

import { ApiService } from "../../core/api.service";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  question: string;
  response?: ChatQueryResponse;
  pending?: boolean;
}

@Component({
  selector: "sd-agent-workspace",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatInputModule, MatListModule],
  templateUrl: "./agent-workspace.component.html",
  styleUrl: "./agent-workspace.component.scss"
})
export class AgentWorkspaceComponent {
  private readonly api = inject(ApiService);

  readonly question = signal("");
  readonly isThinking = signal(false);
  readonly recent = signal<RecentQuestionsResponse["items"]>([]);
  readonly common = signal<CommonQuestionsResponse["items"]>([]);
  readonly messages = signal<ChatMessage[]>([]);

  constructor() {
    this.api.getRecentQuestions().subscribe((payload) => this.recent.set(payload.items));
    this.api.getCommonQuestions().subscribe((payload) => this.common.set(payload.items));
  }

  ask(question: string, selectedScenarioId?: string | null) {
    const trimmed = question.trim();

    if (!trimmed) {
      return;
    }

    const stamp = Date.now();
    this.question.set("");
    this.isThinking.set(true);

    this.messages.update((messages) => [
      ...messages,
      {
        id: `user-${stamp}`,
        role: "user",
        question: trimmed
      },
      {
        id: `assistant-pending-${stamp}`,
        role: "assistant",
        question: trimmed,
        pending: true
      }
    ]);

    this.api.queryChat({ question: trimmed, selectedScenarioId: selectedScenarioId ?? null }).subscribe({
      next: (payload) => {
        this.isThinking.set(false);
        this.messages.update((messages) => {
          const next = [...messages];
          const pendingIndex = next.findIndex((message) => message.id === `assistant-pending-${stamp}`);
          const responseMessage: ChatMessage = {
            id: `assistant-${stamp}`,
            role: "assistant",
            question: trimmed,
            response: payload
          };

          if (pendingIndex >= 0) {
            next.splice(pendingIndex, 1, responseMessage);
            return next;
          }

          return [...next, responseMessage];
        });
      },
      error: () => {
        this.isThinking.set(false);
        this.messages.update((messages) => {
          const next = [...messages];
          const pendingIndex = next.findIndex((message) => message.id === `assistant-pending-${stamp}`);
          const failure: ChatMessage = {
            id: `assistant-${stamp}`,
            role: "assistant",
            question: trimmed,
            response: {
              question: trimmed,
              selectedScenarioId: selectedScenarioId ?? null,
              sayThisToCaller: "I couldn't retrieve an answer just now. Please try again.",
              notes: [],
              steps: [],
              referenceScreenshots: [],
              citations: [],
              cacheHit: false,
              scenarioMatches: []
            }
          };

          if (pendingIndex >= 0) {
            next.splice(pendingIndex, 1, failure);
            return next;
          }

          return [...next, failure];
        });
      }
    });
  }

  chooseScenario(match: ParsedScriptScenarioMatch) {
    this.ask(match.scenarioText, match.id);
  }
}
