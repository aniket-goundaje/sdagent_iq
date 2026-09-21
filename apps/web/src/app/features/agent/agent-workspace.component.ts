import { CommonModule } from "@angular/common";
import { Component, ElementRef, NgZone, QueryList, ViewChild, ViewChildren, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { take } from "rxjs";

import type { ChatQueryResponse, CommonQuestionsResponse, DocumentStatusResponse, ParsedScriptScenarioMatch, RecentQuestionsResponse } from "@sd-agent-iq/shared";

import { ApiService, type HealthResponse } from "../../core/api.service";
import { SessionService } from "../../core/session.service";

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

type KnowledgeUploadKind = "scripts" | "pm";
type KnowledgeUpdateState = "idle" | "updating" | "success";

@Component({
  selector: "sd-agent-workspace",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatInputModule, MatListModule],
  templateUrl: "./agent-workspace.component.html",
  styleUrl: "./agent-workspace.component.scss"
})
export class AgentWorkspaceComponent {
  private static readonly feedbackStorageKey = "sd-agent-feedback-v1";
  private static readonly recentQuestionLimit = 8;

  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  @ViewChild("composerInput") private composerInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChildren("messageRow") private messageRows?: QueryList<ElementRef<HTMLElement>>;

  readonly question = signal("");
  readonly isThinking = signal(false);
  readonly recent = signal<RecentQuestionsResponse["items"]>([]);
  readonly common = signal<CommonQuestionsResponse["items"]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly documentStatus = signal<DocumentStatusResponse | null>(null);
  readonly health = signal<HealthResponse | null>(null);
  readonly selectedScriptsFileName = signal<string | null>(null);
  readonly selectedPmFileName = signal<string | null>(null);
  readonly knowledgeUpdateState = signal<KnowledgeUpdateState>("idle");
  readonly knowledgeProgressMessage = signal<string | null>(null);
  readonly knowledgeUpdatedAt = signal<string | null>(null);
  readonly currentUser = this.session.currentUser;
  readonly isSupervisorWorkspace = computed(() => this.router.url.startsWith("/supervisor") || this.currentUser()?.role === "supervisor");

  constructor() {
    this.api.getRecentQuestions().subscribe((payload) => this.recent.set(payload.items));
    this.api.getCommonQuestions().subscribe((payload) => this.common.set(payload.items));
    this.api.getDocumentStatus().subscribe((payload) => this.documentStatus.set(payload));
    this.api.getHealth().subscribe((payload) => this.health.set(payload));
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
    this.addRecentQuestion(trimmed, stamp);

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
              presentationBlocks: [{ type: "paragraph", text: "I couldn't retrieve an answer just now. Please try again." }],
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

  formatNoteForDisplay(note: string) {
    return note.replace(/^note:\s*/i, "");
  }

  displayName() {
    return this.currentUser()?.displayName ?? "Demo User";
  }

  displayRole() {
    return this.isSupervisorWorkspace() ? "Supervisor" : "Agent";
  }

  activeDocument(kind: "scripts" | "pm") {
    const status = this.documentStatus();
    return status?.activeVersions?.[kind] ?? (status?.activeVersion?.kind === kind ? status.activeVersion : null);
  }

  activeKnowledgeName(kind: "scripts" | "pm") {
    return kind === "scripts" ? "IHSS Service Desk Scripts" : "IHSS Procedures Manual";
  }

  activeKnowledgeVersion(_kind: "scripts" | "pm") {
    return "06/01/2026";
  }

  activeKnowledgeIndexedDate(kind: "scripts" | "pm") {
    return this.knowledgeUpdatedAt() ?? this.activeDocument(kind)?.indexedAt ?? null;
  }

  selectedKnowledgeFile(kind: KnowledgeUploadKind) {
    return kind === "scripts" ? this.selectedScriptsFileName() : this.selectedPmFileName();
  }

  hasSelectedKnowledgeFiles() {
    return Boolean(this.selectedScriptsFileName() && this.selectedPmFileName());
  }

  canUpdateKnowledge() {
    return this.hasSelectedKnowledgeFiles() && this.knowledgeUpdateState() !== "updating";
  }

  onKnowledgeFileSelected(kind: KnowledgeUploadKind, event: Event) {
    const input = event.target as HTMLInputElement;
    const fileName = input.files?.[0]?.name ?? null;

    if (!fileName) {
      return;
    }

    if (kind === "scripts") {
      this.selectedScriptsFileName.set(fileName);
    } else {
      this.selectedPmFileName.set(fileName);
    }

    this.knowledgeUpdateState.set("idle");
    this.knowledgeProgressMessage.set(null);
  }

  updateKnowledge() {
    if (!this.canUpdateKnowledge()) {
      return;
    }

    const progress = ["Uploading documents...", "Reading documents...", "Preparing knowledge...", "Updating search experience...", "Knowledge updated successfully."];
    this.knowledgeUpdateState.set("updating");
    this.knowledgeProgressMessage.set(progress[0]);

    progress.slice(1).forEach((message, index) => {
      window.setTimeout(() => {
        this.knowledgeProgressMessage.set(message);

        if (index === progress.length - 2) {
          this.knowledgeUpdateState.set("success");
          this.knowledgeUpdatedAt.set(new Date().toISOString());
        }
      }, (index + 1) * 700);
    });
  }

  formatDate(value?: string | null) {
    if (!value) {
      return "Not indexed";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date(value));
  }

  retrievalMode() {
    return "Hybrid";
  }

  embeddingModel() {
    return this.health()?.environment.embeddingModel ?? "Not available";
  }

  indexStatus() {
    return this.documentStatus()?.ingestionState ?? "not_started";
  }

  indexStatusLabel() {
    const status = this.indexStatus();
    return status === "completed" ? "Indexed" : status.replace(/_/g, " ");
  }

  logout() {
    this.session.clear();
    void this.router.navigateByUrl("/");
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

  private addRecentQuestion(question: string, stamp: number) {
    this.recent.update((items) => {
      const normalized = question.toLowerCase();
      const existing = items.filter((item) => item.question.toLowerCase() !== normalized);

      return [{ id: `local-${stamp}`, question, askedAt: new Date(stamp).toISOString() }, ...existing].slice(0, AgentWorkspaceComponent.recentQuestionLimit);
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
