import { CommonModule } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { MatTabsModule } from "@angular/material/tabs";
import { FormsModule } from "@angular/forms";

import type { ChatQueryResponse, CommonQuestionsResponse, RecentQuestionsResponse } from "@sd-agent-iq/shared";

import { ApiService } from "../../core/api.service";

@Component({
  selector: "sd-agent-workspace",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatInputModule, MatListModule, MatTabsModule],
  templateUrl: "./agent-workspace.component.html",
  styleUrl: "./agent-workspace.component.scss"
})
export class AgentWorkspaceComponent {
  private readonly api = inject(ApiService);

  readonly question = signal("");
  readonly isThinking = signal(false);
  readonly recent = signal<RecentQuestionsResponse["items"]>([]);
  readonly common = signal<CommonQuestionsResponse["items"]>([]);
  readonly response = signal<ChatQueryResponse | null>(null);

  constructor() {
    this.api.getRecentQuestions().subscribe((payload) => this.recent.set(payload.items));
    this.api.getCommonQuestions().subscribe((payload) => this.common.set(payload.items));
  }

  ask(question: string) {
    const trimmed = question.trim();

    if (!trimmed) {
      return;
    }

    this.question.set(trimmed);
    this.isThinking.set(true);

    this.api.queryChat({ question: trimmed }).subscribe((payload) => {
      this.response.set(payload);
      this.isThinking.set(false);
    });
  }
}
