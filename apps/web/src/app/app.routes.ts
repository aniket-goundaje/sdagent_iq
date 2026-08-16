import { Routes } from "@angular/router";

import { AgentWorkspaceComponent } from "./features/agent/agent-workspace.component";
import { LoginPageComponent } from "./features/auth/login-page.component";
import { SupervisorWorkspaceComponent } from "./features/supervisor/supervisor-workspace.component";

export const appRoutes: Routes = [
  { path: "", component: LoginPageComponent },
  { path: "agent", component: AgentWorkspaceComponent },
  { path: "supervisor", component: SupervisorWorkspaceComponent },
  { path: "**", redirectTo: "" }
];
