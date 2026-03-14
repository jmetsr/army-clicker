const fs = require("fs");
const log = JSON.parse(fs.readFileSync(process.argv[2] || "/home/jjsclaude/Downloads/army-clicker-log-2026-03-08T23-01-18.json"));

const playerClicks = log.playerClicks || [];

// Count actions by type
const actionCounts = {};
playerClicks.forEach(c => {
  actionCounts[c.action] = (actionCounts[c.action] || 0) + 1;
});

console.log("=== PLAYER ACTIONS ===");
Object.entries(actionCounts).sort((a,b) => b[1] - a[1]).forEach(([action, count]) => {
  console.log(action + ": " + count);
});

// Look at army chain progression
console.log("\n=== PLAYER PROGRESSION ===");
const seen = {};
playerClicks.forEach(c => {
  const key = "sl:" + c.sl + " bar:" + c.bar + " mb:" + c.mb + " king:" + c.king;
  if (!seen[key] && (c.sl > 0 || c.bar > 0 || c.mb > 0 || c.king > 0)) {
    seen[key] = true;
    console.log("Day " + c.day + " - SL:" + c.sl + " Bar:" + c.bar + " MB:" + c.mb + " King:" + c.king + " rp:" + c.rp + " Troops:" + c.troops);
  }
});

// AI progression
console.log("\n=== AI PROGRESSION ===");
const aiEvents = (log.gameEvents || []).filter(e => e.type === "ai");
const aiByDay = {};
aiEvents.forEach(e => {
  if (!aiByDay[e.day] || e.troops > aiByDay[e.day].troops) {
    aiByDay[e.day] = e;
  }
});
[10, 20, 50, 100, 140].forEach(d => {
  const e = aiByDay[d];
  if (e) console.log("Day " + d + " - Troops:" + e.troops + " Farms:" + e.farms);
});

// Check AI actions
const aiActionCounts = {};
aiEvents.forEach(e => {
  aiActionCounts[e.action] = (aiActionCounts[e.action] || 0) + 1;
});
console.log("\n=== AI ACTIONS ===");
Object.entries(aiActionCounts).sort((a,b) => b[1] - a[1]).forEach(([action, count]) => {
  console.log(action + ": " + count);
});
