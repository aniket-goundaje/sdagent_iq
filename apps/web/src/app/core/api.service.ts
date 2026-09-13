import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { ChatQueryRequest, ChatQueryResponse, CommonQuestionsResponse, DocumentStatusResponse, LoginRequest, LoginResponse, RecentQuestionsResponse } from "@sd-agent-iq/shared";

export interface HealthResponse {
  status: string;
  service: string;
  environment: {
    apiPort: number;
    databaseConfigured: boolean;
    openAiConfigured: boolean;
    chatModel: string;
    embeddingModel: string;
  };
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = "/api";

  login(payload: LoginRequest) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login`, payload);
  }

  getRecentQuestions() {
    return this.http.get<RecentQuestionsResponse>(`${this.baseUrl}/chat/recent`);
  }

  getCommonQuestions() {
    return this.http.get<CommonQuestionsResponse>(`${this.baseUrl}/chat/common`);
  }

  queryChat(payload: ChatQueryRequest) {
    return this.http.post<ChatQueryResponse>(`${this.baseUrl}/chat/query`, payload);
  }

  getDocumentStatus() {
    return this.http.get<DocumentStatusResponse>(`${this.baseUrl}/admin/documents/status`);
  }

  getHealth() {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`);
  }
}
