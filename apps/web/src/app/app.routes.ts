import { Routes } from "@angular/router";

import { AgentWorkspaceComponent } from "./features/agent/agent-workspace.component";
import { LoginPageComponent } from "./features/auth/login-page.component";

export const appRoutes: Routes = [
  { path: "", component: LoginPageComponent },
  { path: "agent", component: AgentWorkspaceComponent },
  { path: "supervisor", component: AgentWorkspaceComponent },
  { path: "**", redirectTo: "" }
];
