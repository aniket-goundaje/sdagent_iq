import type { UserProfile } from "../users/user.types";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionPayload {
  accessToken: string;
  expiresAt: string;
}

export interface LoginResponse {
  user: UserProfile;
  session: SessionPayload;
}
