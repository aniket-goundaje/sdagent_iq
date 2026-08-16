import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { ChatQueryRequest, ChatQueryResponse, CommonQuestionsResponse, DocumentStatusResponse, LoginRequest, LoginResponse, RecentQuestionsResponse } from "@sd-agent-iq/shared";

@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = "http://localhost:3000/api";

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
}
