// 配置模块：合并运行配置、校验配置形状，并提供敏感信息脱敏能力。
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { PermissionDecision } from "./types.js";

loadEnv();

const configSchema = z.object({
  provider: z.literal("anthropic"),
  model: z.string().min(1),
  maxTurns: z.number().int().positive(),
  permissionDefault: z.enum(["allow", "ask", "deny"]),
  anthropicApiKey: z.string().min(1).optional(),
});

export type Config = z.infer<typeof configSchema>;

const configLayerSchema = configSchema.partial();

type ConfigLayer = z.infer<typeof configLayerSchema>;

type EnvConfig = Record<string, string | undefined>;

export type ReadConfigOptions = {
  env?: EnvConfig;
  userConfig?: ConfigLayer;
  projectConfig?: ConfigLayer;
  cliFlags?: ConfigLayer;
};

const builtInDefaults: Config = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  maxTurns: 10,
  permissionDefault: "ask",
};

// 按文档约定的优先级合并配置：默认值 < 环境变量 < 用户配置 < 项目配置 < CLI flags。
export function readConfig(options: ReadConfigOptions = {}): Config {
  const merged = {
    ...builtInDefaults,
    ...readEnvConfig(options.env ?? process.env),
    ...parseLayer(options.userConfig),
    ...parseLayer(options.projectConfig),
    ...parseLayer(options.cliFlags),
  };

  return configSchema.parse(merged);
}

// 在写入 recorder、transcript 或 model context 前复用这个函数，避免泄漏已知 secret。
export function redactSecrets<T>(value: T, config: Pick<Config, "anthropicApiKey">): T {
  const secrets = [config.anthropicApiKey].filter((secret): secret is string => Boolean(secret));
  return redactValue(value, secrets) as T;
}

// 环境变量只在这里映射成内部配置字段，避免大写 env key 泄漏到后续模块。
function readEnvConfig(env: EnvConfig): ConfigLayer {
  return parseLayer({
    model: env.OPENCAMILLE_MODEL,
    maxTurns: parseOptionalInteger(env.OPENCAMILLE_MAX_TURNS),
    permissionDefault: env.OPENCAMILLE_PERMISSION_DEFAULT as PermissionDecision | undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
  });
}

function parseLayer(layer: ConfigLayer | undefined): ConfigLayer {
  return configLayerSchema.parse(removeUndefined(layer ?? {}));
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number(value);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

// 递归处理字符串、数组和普通对象；其他值保持原样，避免改变记录结构。
function redactValue(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, secrets));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactValue(entry, secrets)]),
    );
  }

  return value;
}
