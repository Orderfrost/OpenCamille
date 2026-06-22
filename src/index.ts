import { readConfig } from "./config.js";

function main(): void {
  const config = readConfig();
  console.log("OpenCamille — config loaded:", Object.keys(config).join(", "));
}

main();
