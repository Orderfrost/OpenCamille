// CLI 入口占位：当前只验证配置能被加载，完整 CLI 会在 v0.1 后续任务实现。
import { readConfig } from "./config.js";

function main(): void {
  const config = readConfig();
  console.log("OpenCamille — config loaded:", Object.keys(config).join(", "));
}

main();
