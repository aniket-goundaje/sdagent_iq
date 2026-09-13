import { Injectable, signal } from "@angular/core";
import type { LoginResponse, UserProfile } from "@sd-agent-iq/shared";

interface StoredSession {
  user: UserProfile;
  accessToken: string;
  expiresAt: string;
}

@Injectable({ providedIn: "root" })
export class SessionService {
  private static readonly storageKey = "sd-agent-session-v1";

  readonly currentUser = signal<UserProfile | null>(this.readSession()?.user ?? null);

  saveLogin(response: LoginResponse) {
    const session: StoredSession = {
      user: response.user,
      accessToken: response.session.accessToken,
      expiresAt: response.session.expiresAt
    };

    window.localStorage.setItem(SessionService.storageKey, JSON.stringify(session));
    this.currentUser.set(response.user);
  }

  clear() {
    window.localStorage.removeItem(SessionService.storageKey);
    this.currentUser.set(null);
  }

  private readSession(): StoredSession | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(SessionService.storageKey);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }
}
