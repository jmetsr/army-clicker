// ================================================================
//  MAIN - Entry point, initializes game
// ================================================================

// Set up circular dependencies
setGetUpgradeMult(getUpgradeMult);
setModalFunctions(openUpgradeModal, openAutoUpgraderModal);
setRunAI(runAI);
setUpdateUI(updateUI);
setCheckFlavorEvents(checkFlavorEvents);

// Initialize
function init() {
  // Initialize color scheme
  initColorScheme();

  // Initialize buttons
  initButtons();

  // Build UI
  buildButtons();
  createMainAutoUpgraders();

  // Set up event listeners
  setupEventListeners();

  // Initial UI update
  updateUI();

  // Start game loops
  setInterval(tick, 1000);
  setInterval(lootTick, 250);
}

// Expose globals for console debugging
window.ON = ON;
window.OrdinalNumber = OrdinalNumber;
window.C = C;
window.G = G;
window.BUTTONS = BUTTONS;
window.exportLog = exportLog;
window.getGameLog = getGameLog;
window.clearLog = clearLog;
window.updateUI = updateUI;
window.updateMainAutoUpgraders = updateMainAutoUpgraders;

// AI simulation
window.simAI = function(days, clicks) {
  days = days || 200;
  clicks = clicks || 10;
  var results = runSimulation(days, clicks);
  return results;
};

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
