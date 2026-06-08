// Demo verification suite — runs authenticated Playwright flows against LIVE Odoo.
// Usage: node scripts/demo-verify/run-all.mjs [--only A,B,C]
import { launch, makeRecorder, writeReport } from "./lib.mjs";
import { runGroupA } from "./groupA.mjs";
import { runGroupB } from "./groupB.mjs";
import { runGroupC } from "./groupC.mjs";
import { runGroupD } from "./groupD.mjs";
import { runGroupE } from "./groupE.mjs";
import { runGroupF } from "./groupF.mjs";
import { runGroupG } from "./groupG.mjs";
import { runGroupH } from "./groupH.mjs";
import { runGroupI } from "./groupI.mjs";

const arg = process.argv.find((a) => a.startsWith("--only"));
const only = arg ? (arg.split("=")[1] || process.argv[process.argv.indexOf(arg) + 1] || "").toUpperCase().split(/[,\s]+/).filter(Boolean) : null;
const want = (g) => !only || only.includes(g);

const GROUPS = [
  ["A", runGroupA],
  ["B", runGroupB],
  ["C", runGroupC],
  ["D", runGroupD],
  ["E", runGroupE],
  ["F", runGroupF],
  ["G", runGroupG],
  ["H", runGroupH],
  ["I", runGroupI],
];

const rec = makeRecorder();
const browser = await launch();
try {
  for (const [g, fn] of GROUPS) {
    if (!want(g)) continue;
    console.log(`\n===== GROUP ${g} =====`);
    try {
      await fn(browser, rec);
    } catch (e) {
      rec.add(g + "X", `Group ${g} crashed`, false, (e && e.message) || String(e));
    }
  }
} finally {
  await browser.close();
}

const summary = writeReport(rec.results, "Miza demo verification");
console.log(`\n===== ${summary.pass}/${summary.total} passed, ${summary.fail} failed =====`);
console.log(`Report: ${summary.dir}/REPORT.md`);
process.exit(summary.fail ? 1 : 0);
