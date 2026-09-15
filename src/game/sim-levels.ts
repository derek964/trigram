import { mkdirSync, writeFileSync } from "node:fs";
import { formatSimReport, runCampaignSim, simCommandOk } from "./sim";

const sim = runCampaignSim();
const md = formatSimReport(sim);
mkdirSync("docs", { recursive: true });
writeFileSync("docs/sim-report.md", md);
process.stdout.write(md);
process.stdout.write(
  `\nGate: optimal ${sim.optimalClears}/30, catch ${sim.catchPass}/${sim.thiefLevels}, grass ${sim.grassPass}/${sim.thiefLevels}\n`,
);
if (!simCommandOk(sim)) {
  console.error("sim:levels failed — see docs/sim-report.md");
  process.exit(1);
}
