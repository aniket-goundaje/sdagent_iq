import { CommonModule } from "@angular/common";
import { Component, ElementRef, NgZone, QueryList, ViewChild, ViewChildren, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { take } from "rxjs";

import type { ChatQueryResponse, CommonQuestionsResponse, ParsedScriptScenarioMatch, RecentQuestionsResponse } from "@sd-agent-iq/shared";

import { ApiService } from "../../core/api.service";

type FeedbackChoice = "helpful" | "not_helpful";

interface FeedbackState {
  choice: FeedbackChoice | null;
  comments: string;
  submittedAt: string | null;
  updatedAt: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  question: string;
  response?: ChatQueryResponse;
  pending?: boolean;
  feedback?: FeedbackState;
}

interface StoredFeedbackRecord {
  id: string;
  timestamp: string;
  updatedAt: string;
  question: string;
  selectedScenarioId: string | null;
  helpful: boolean;
  comments: string;
}

@Component({
  selector: "sd-agent-workspace",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatInputModule, MatListModule],
  templateUrl: "./agent-workspace.component.html",
  styleUrl: "./agent-workspace.component.scss"
})
export class AgentWorkspaceComponent {
  private static readonly feedbackStorageKey = "sd-agent-feedback-v1";

  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);

  @ViewChild("composerInput") private composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChildren("messageRow") private messageRows?: QueryList<ElementRef<HTMLElement>>;

  readonly question = signal("");
  readonly isThinking = signal(false);
  readonly recent = signal<RecentQuestionsResponse["items"]>([]);
  readonly common = signal<CommonQuestionsResponse["items"]>([]);
  readonly messages = signal<ChatMessage[]>([]);

  constructor() {
    this.api.getRecentQuestions().subscribe((payload) => this.recent.set(payload.items));
    this.api.getCommonQuestions().subscribe((payload) => this.common.set(payload.items));
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey || event.repeat) {
      return;
    }

    event.preventDefault();
    this.submitQuestion();
  }

  submitQuestion() {
    this.ask(this.question());
  }

  ask(question: string, selectedScenarioId?: string | null) {
    const trimmed = question.trim();

    if (!trimmed || this.isThinking()) {
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
        pending: true,
        feedback: this.createEmptyFeedback()
      }
    ]);
    this.scrollLatestAnswerIntoView();
    this.focusComposer();

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
            response: payload,
            feedback: this.createEmptyFeedback()
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
            feedback: this.createEmptyFeedback(),
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

  getLoadingMessage(question: string) {
    const normalized = question.toLowerCase();

    if (normalized.includes("manual") || normalized.includes("procedure")) {
      return "Searching Procedures Manual...";
    }

    if (normalized.includes("timesheet") || normalized.includes("payment") || normalized.includes("deposit")) {
      return "Searching approved Scripts...";
    }

    return "Finding the best matching caller script...";
  }

  canSubmit() {
    return !this.isThinking() && this.question().trim().length > 0;
  }

  isFeedbackExpanded(message: ChatMessage) {
    return message.feedback?.choice === "not_helpful";
  }

  chooseFeedback(messageId: string, choice: FeedbackChoice) {
    this.updateFeedback(messageId, (current) => ({
      ...current,
      choice,
      submittedAt: current.submittedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  updateFeedbackComments(messageId: string, comments: string) {
    this.updateFeedback(messageId, (current) => ({
      ...current,
      comments,
      updatedAt: new Date().toISOString()
    }));
  }

  trackByMessageId(_index: number, message: ChatMessage) {
    return message.id;
  }

  private scrollLatestAnswerIntoView() {
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      const latestRow = this.messageRows?.last?.nativeElement;

      if (!latestRow) {
        return;
      }

      latestRow.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  private focusComposer() {
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      this.composerInput?.nativeElement.focus();
    });
  }

  private createEmptyFeedback(): FeedbackState {
    return {
      choice: null,
      comments: "",
      submittedAt: null,
      updatedAt: null
    };
  }

  private updateFeedback(messageId: string, updater: (current: FeedbackState) => FeedbackState) {
    this.messages.update((messages) => {
      return messages.map((message) => {
        if (message.id !== messageId || message.role !== "assistant" || !message.response || message.response.scenarioMatches.length > 0) {
          return message;
        }

        const current = message.feedback ?? this.createEmptyFeedback();
        const feedback = updater(current);
        this.persistFeedback(message, feedback);

        return {
          ...message,
          feedback
        };
      });
    });
  }

  private persistFeedback(message: ChatMessage, feedback: FeedbackState) {
    if (typeof window === "undefined" || !message.response || message.response.scenarioMatches.length > 0 || !feedback.choice) {
      return;
    }

    const record: StoredFeedbackRecord = {
      id: message.id,
      timestamp: feedback.submittedAt ?? new Date().toISOString(),
      updatedAt: feedback.updatedAt ?? new Date().toISOString(),
      question: message.question,
      selectedScenarioId: message.response.selectedScenarioId,
      helpful: feedback.choice === "helpful",
      comments: feedback.comments.trim()
    };

    const existing = this.readStoredFeedback();
    const next = [...existing.filter((item) => item.id !== record.id), record];
    window.localStorage.setItem(AgentWorkspaceComponent.feedbackStorageKey, JSON.stringify(next));
  }

  private readStoredFeedback(): StoredFeedbackRecord[] {
    if (typeof window === "undefined") {
      return [];
    }

    const raw = window.localStorage.getItem(AgentWorkspaceComponent.feedbackStorageKey);

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as StoredFeedbackRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
