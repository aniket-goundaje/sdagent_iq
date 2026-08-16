import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  apiPort: Number(process.env.API_PORT ?? 3000),
  databaseUrl: requireEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/sd_agent_iq"),
  openAiApiKey: requireEnv("OPENAI_API_KEY", "placeholder-key"),
  openAiChatModel: requireEnv("OPENAI_CHAT_MODEL", "gpt-5.5"),
  openAiEmbeddingModel: requireEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  jwtSecret: requireEnv("JWT_SECRET", "replace_me"),
  demoSupervisorEmail: requireEnv("DEMO_SUPERVISOR_EMAIL", "supervisor@sdagentiq.local"),
  demoSupervisorPassword: requireEnv("DEMO_SUPERVISOR_PASSWORD", "supervisor-demo"),
  demoAgentEmail: requireEnv("DEMO_AGENT_EMAIL", "agent@sdagentiq.local"),
  demoAgentPassword: requireEnv("DEMO_AGENT_PASSWORD", "agent-demo")
};
