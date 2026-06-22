import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
});

export type Config = z.infer<typeof configSchema>;

export function readConfig(): Config {
  return configSchema.parse(process.env);
}
