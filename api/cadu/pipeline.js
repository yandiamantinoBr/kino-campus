// Strict direct/root proxy for /api/cadu/pipeline[/*]. Sub-path traffic is
// normally rewritten to pipeline-router; both entry points share one contract.

import {
  extractDirectPipelinePath,
  handleCaduPipelineProxy,
} from '../../server/cadu-control-proxy.js';

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  return handleCaduPipelineProxy(req, res, extractDirectPipelinePath(req));
}
