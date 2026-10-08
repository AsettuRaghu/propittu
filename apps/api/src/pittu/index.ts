/**
 * Pittu — the one AI module (docs/PITTU.md). The application layer imports
 * from here; Pittu returns facts and findings and never decides business
 * outcomes.
 *
 *   core/   providers, task contracts, the budget, runTask(), cost by capability
 *   read/   Pittu Read — documents (sale deed today)
 *   (ask, watch, value, legal — added as they are built, on the same core)
 */
export { assertAiAvailable } from './core/limits.js';
export {
  canStartReading,
  isRetryableFailure,
  loadAnalysis,
  loadStaffReading,
  needsRun,
  processAnalysis,
  requestAnalysis,
  requestStaffReading,
  requeueFailedAnalysis,
  sha256,
  type AnalysisRow,
  type ReadHooks,
} from './read/jobs.js';
