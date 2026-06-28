# Layer 5: Infrastructure

Infrastructure contains low-level adapters and safety boundaries.

```text
Infrastructure
  ProviderAdapter
  Config
  PermissionEngine
  MCPClient
  CommandRunner
  WorkspacePath
```

`ProviderAdapter` hides provider-specific SDK/API formats and exposes
provider-neutral streaming items.

`Config` loads env/config files, applies precedence, and prevents secrets from
entering Recorder output.

`PermissionEngine` returns only `allow | ask | deny`. It does not wait for users
and does not own approval state.

`MCPClient` handles stdio JSON-RPC in v0.1.

`CommandRunner` is the `runCommand()` capability for timeouts, abort signals,
stdout/stderr limits, and exit code normalization.

`WorkspacePath` is the `resolveWorkspacePath()` capability for workspace path
boundary checks.

Do not add v0.1 abstractions for `FileSystem`, `Shell` class, `Storage`,
`Sandbox`, `ProviderFactory`, `PolicyStore`, `SecretsManager`, or
`NetworkClient`.
