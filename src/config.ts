// 配置模块：读取 Provider Profile 配置，解析当前协议端点，并提供脱敏能力。

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { PermissionDecision } from "./types.js";

loadEnv();

const providerProtocolSchema = z.enum([
  "openai-responses",
  "openai-chat-completions",
  "anthropic-messages",
]);

const runtimeConfigSchema = z.object({
  maxTurns: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().int().positive().optional(),
  stopSequences: z.array(z.string()).optional(),
  reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  seed: z.number().int().optional(),
  toolChoice: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  parallelToolCalls: z.boolean().optional(),
  responseFormat: z.record(z.string(), z.unknown()).optional(),
  user: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  store: z.boolean().optional(),
  serviceTier: z.string().min(1).optional(),
  logprobs: z.boolean().optional(),
  topLogprobs: z.number().int().nonnegative().optional(),
  thinking: z.record(z.string(), z.unknown()).optional(),
  permissionDefault: z.enum(["allow", "ask", "deny"]),
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().nonnegative(),
});

const providerProfileSchema = z.object({
  vendor: z.string().min(1).optional(),
  protocol: providerProtocolSchema.optional(),
  baseUrl: z.string().url().optional(),
  version: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  authToken: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  organization: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  beta: z.string().min(1).optional(),
});

const resolvedProviderSchema = providerProfileSchema.extend({
  name: z.string().min(1),
  protocol: providerProtocolSchema,
  baseUrl: z.string().url(),
  model: z.string().min(1),
});

const configSchema = z.object({
  activeProvider: z.string().min(1),
  runtime: runtimeConfigSchema,
  provider: resolvedProviderSchema,
});

export type Config = z.infer<typeof configSchema>;
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;

const configLayerSchema = z.object({
  activeProvider: z.string().min(1).optional(),
  runtime: runtimeConfigSchema.partial().optional(),
  provider: providerProfileSchema.optional(),
  providers: z.record(z.string(), providerProfileSchema).optional(),
});

type ConfigLayer = z.infer<typeof configLayerSchema>;
type ProviderProfile = z.infer<typeof providerProfileSchema>;

type EnvConfig = Record<string, string | undefined>;

export type ReadConfigOptions = {
  env?: EnvConfig;
  userConfig?: ConfigLayer;
  projectConfig?: ConfigLayer;
  localConfig?: ConfigLayer;
  cliFlags?: ConfigLayer;
  userConfigPath?: string;
  projectConfigPath?: string;
  localConfigPath?: string;
  cwd?: string;
  homeDir?: string;
};

const builtInDefaults: Config = {
  activeProvider: "anthropic",
  runtime: {
    maxTurns: 10,
    maxOutputTokens: 1024,
    permissionDefault: "ask",
    timeoutMs: 60_000,
    maxRetries: 2,
  },
  provider: {
    name: "anthropic",
    vendor: "anthropic",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com/v1",
    version: "2023-06-01",
    model: "claude-sonnet-4-5",
  },
};

const builtInConfigLayer: ConfigLayer = {
  activeProvider: builtInDefaults.activeProvider,
  runtime: builtInDefaults.runtime,
  providers: {
    openai: {
      vendor: "openai",
      protocol: "openai-responses",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.5",
    },
    anthropic: builtInDefaults.provider,
  },
};

export class ConfigReader {
  // 按约定优先级合并配置：默认值 < user JSON < project JSON < local JSON < env < CLI flags。
  read(options: ReadConfigOptions = {}): Config {
    const base = mergeConfigLayers([
      builtInConfigLayer,
      ...readConfigFiles(options),
      parseLayer(options.userConfig),
      parseLayer(options.projectConfig),
      parseLayer(options.localConfig),
    ]);
    const cliLayer = parseLayer(options.cliFlags);
    const activeProvider =
      cliLayer.activeProvider ??
      readEnvActiveProvider(options.env ?? process.env) ??
      base.activeProvider ??
      builtInDefaults.activeProvider;
    const baseProvider = base.providers[activeProvider] ?? {};
    const envLayer = readEnvConfig(options.env ?? process.env, baseProvider.protocol);
    const provider = {
      name: activeProvider,
      ...baseProvider,
      ...removeUndefined(envLayer.provider ?? {}),
      ...removeUndefined(cliLayer.provider ?? {}),
    };
    const runtime = {
      ...builtInDefaults.runtime,
      ...base.runtime,
      ...removeUndefined(envLayer.runtime ?? {}),
      ...removeUndefined(cliLayer.runtime ?? {}),
    };

    return configSchema.parse({
      activeProvider,
      runtime,
      provider,
    });
  }

  // 在写入 recorder、transcript 或 model context 前复用这个方法，避免泄漏已知 secret。
  redactSecrets<T>(value: T, config: Pick<Config, "provider">): T {
    const secrets = [config.provider.apiKey, config.provider.authToken].filter(isString);
    return redactValue(value, secrets) as typeof value;
  }
}

export const configReader = new ConfigReader();

function readEnvActiveProvider(env: EnvConfig): string | undefined {
  return env.OPENCAMILLE_ACTIVE_PROVIDER ?? env.OPENCAMILLE_PROVIDER;
}

// 环境变量只在这里映射成当前 Provider Profile 的覆盖字段，避免大写 env key 泄漏到后续模块。
function readEnvConfig(env: EnvConfig, protocol: ProviderProtocol | undefined): ConfigLayer {
  return parseLayer({
    runtime: {
      maxTurns: parseOptionalInteger(env.OPENCAMILLE_MAX_TURNS),
      maxOutputTokens: parseOptionalInteger(env.OPENCAMILLE_MAX_OUTPUT_TOKENS),
      temperature: parseOptionalNumber(env.OPENCAMILLE_TEMPERATURE),
      topP: parseOptionalNumber(env.OPENCAMILLE_TOP_P),
      topK: parseOptionalInteger(env.OPENCAMILLE_TOP_K),
      presencePenalty: parseOptionalNumber(env.OPENCAMILLE_PRESENCE_PENALTY),
      frequencyPenalty: parseOptionalNumber(env.OPENCAMILLE_FREQUENCY_PENALTY),
      seed: parseOptionalInteger(env.OPENCAMILLE_SEED),
      parallelToolCalls: parseOptionalBoolean(env.OPENCAMILLE_PARALLEL_TOOL_CALLS),
      user: env.OPENCAMILLE_USER,
      store: parseOptionalBoolean(env.OPENCAMILLE_STORE),
      serviceTier: env.OPENCAMILLE_SERVICE_TIER,
      logprobs: parseOptionalBoolean(env.OPENCAMILLE_LOGPROBS),
      topLogprobs: parseOptionalInteger(env.OPENCAMILLE_TOP_LOGPROBS),
      permissionDefault: env.OPENCAMILLE_PERMISSION_DEFAULT as PermissionDecision | undefined,
      timeoutMs: parseOptionalInteger(env.OPENCAMILLE_TIMEOUT_MS),
      maxRetries: parseOptionalInteger(env.OPENCAMILLE_MAX_RETRIES),
    },
    provider: {
      protocol: env.OPENCAMILLE_PROVIDER_PROTOCOL as ProviderProtocol | undefined,
      baseUrl: env.OPENCAMILLE_BASE_URL ?? readProtocolBaseUrl(env, protocol),
      version: env.OPENCAMILLE_PROVIDER_VERSION ?? env.OPENCAMILLE_ANTHROPIC_VERSION,
      model: env.OPENCAMILLE_MODEL,
      apiKey: env.OPENCAMILLE_API_KEY ?? readProtocolApiKey(env, protocol),
      authToken: env.OPENCAMILLE_AUTH_TOKEN,
      organization: env.OPENCAMILLE_ORGANIZATION ?? env.OPENAI_ORG_ID,
      project: env.OPENCAMILLE_PROJECT ?? env.OPENAI_PROJECT_ID,
      beta: env.OPENCAMILLE_PROVIDER_BETA,
    },
  });
}

function readConfigFiles(options: ReadConfigOptions): Array<ConfigLayer | undefined> {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  return [
    readConfigFile(options.userConfigPath ?? join(homeDir, ".opencamille", "config.json")),
    readConfigFile(options.projectConfigPath ?? join(cwd, ".opencamille", "config.json")),
    readConfigFile(options.localConfigPath ?? join(cwd, ".opencamille", "config.local.json")),
  ];
}

function readConfigFile(path: string): ConfigLayer | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return configLayerSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function mergeConfigLayers(layers: Array<ConfigLayer | undefined>): {
  activeProvider?: string;
  runtime: NonNullable<ConfigLayer["runtime"]>;
  providers: Record<string, ProviderProfile>;
} {
  let activeProvider: string | undefined;
  let runtime: NonNullable<ConfigLayer["runtime"]> = {};
  const providers: Record<string, ProviderProfile> = {};

  for (const layer of layers) {
    if (!layer) {
      continue;
    }

    activeProvider = layer.activeProvider ?? activeProvider;
    runtime = { ...runtime, ...removeUndefined(layer.runtime ?? {}) };

    for (const [name, provider] of Object.entries(layer.providers ?? {})) {
      providers[name] = { ...providers[name], ...removeUndefined(provider) };
    }
  }

  return { activeProvider, runtime, providers };
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

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Number(value);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === "true";
}

function readProtocolApiKey(
  env: EnvConfig,
  protocol: ProviderProtocol | undefined,
): string | undefined {
  if (protocol === "anthropic-messages") {
    return env.ANTHROPIC_API_KEY;
  }

  if (protocol === "openai-responses" || protocol === "openai-chat-completions") {
    return env.OPENAI_API_KEY;
  }

  return undefined;
}

function readProtocolBaseUrl(
  env: EnvConfig,
  protocol: ProviderProtocol | undefined,
): string | undefined {
  if (protocol === "anthropic-messages") {
    return env.OPENCAMILLE_ANTHROPIC_BASE_URL;
  }

  if (protocol === "openai-responses" || protocol === "openai-chat-completions") {
    return env.OPENCAMILLE_OPENAI_BASE_URL;
  }

  return undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
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
