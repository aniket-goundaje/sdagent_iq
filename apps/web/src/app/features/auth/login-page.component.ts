import { CommonModule } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";

import { ApiService } from "../../core/api.service";

@Component({
  selector: "sd-login-page",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: "./login-page.component.html",
  styleUrl: "./login-page.component.scss"
})
export class LoginPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly errorMessage = signal("");
  readonly isSubmitting = signal(false);

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ["agent@sdagentiq.local", [Validators.required, Validators.email]],
    password: ["agent-demo", Validators.required]
  });

  useSupervisorDemo() {
    this.loginForm.setValue({
      email: "supervisor@sdagentiq.local",
      password: "supervisor-demo"
    });
  }

  useAgentDemo() {
    this.loginForm.setValue({
      email: "agent@sdagentiq.local",
      password: "agent-demo"
    });
  }

  submit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set("");
    this.isSubmitting.set(true);

    this.api.login(this.loginForm.getRawValue()).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        const destination = response.user.role === "supervisor" ? "/supervisor" : "/agent";
        void this.router.navigateByUrl(destination);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.errorMessage.set("Login failed. Use one of the demo accounts to continue.");
      }
    });
  }
}
