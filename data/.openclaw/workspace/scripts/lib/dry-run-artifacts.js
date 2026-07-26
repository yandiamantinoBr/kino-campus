'use strict';

const path = require('path');

const DRY_RUN_ARTIFACT_ROOT_ENV = 'CADU_DRY_RUN_ARTIFACT_DIR';

function isPathInside(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolve an explicitly requested dry-run artifact without allowing it to
 * escape the ephemeral directory owned by pipeline-kino.
 *
 * A standalone dry-run without --output remains write-free and returns null.
 */
function resolveDryRunOutput(outputPath, { dryRun, label = 'dry-run artifact' } = {}) {
  if (!outputPath) return null;
  const resolvedOutput = path.resolve(outputPath);
  if (!dryRun) {
    throw new Error(`${label}: --output is only permitted with --dry-run`);
  }

  const root = String(process.env[DRY_RUN_ARTIFACT_ROOT_ENV] || '').trim();
  if (!root) {
    throw new Error(`${label}: ${DRY_RUN_ARTIFACT_ROOT_ENV} is required with --dry-run --output`);
  }
  if (!isPathInside(root, resolvedOutput)) {
    throw new Error(`${label}: output must stay inside ${DRY_RUN_ARTIFACT_ROOT_ENV}`);
  }
  return resolvedOutput;
}

module.exports = {
  DRY_RUN_ARTIFACT_ROOT_ENV,
  isPathInside,
  resolveDryRunOutput,
};
