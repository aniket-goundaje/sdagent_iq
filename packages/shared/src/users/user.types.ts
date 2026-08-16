export type UserRole = "agent" | "supervisor";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}
