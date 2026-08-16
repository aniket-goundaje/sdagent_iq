import { CommonModule } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { MatCardModule } from "@angular/material/card";

import type { DocumentStatusResponse } from "@sd-agent-iq/shared";

import { ApiService } from "../../core/api.service";

@Component({
  selector: "sd-supervisor-workspace",
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: "./supervisor-workspace.component.html",
  styleUrl: "./supervisor-workspace.component.scss"
})
export class SupervisorWorkspaceComponent {
  private readonly api = inject(ApiService);

  readonly status = signal<DocumentStatusResponse | null>(null);

  constructor() {
    this.api.getDocumentStatus().subscribe((payload) => this.status.set(payload));
  }
}
