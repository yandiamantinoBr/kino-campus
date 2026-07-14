// Strict rewrite target for /api/cadu/pipeline/(.+) -> ?path=$1.

import { handleCaduPipelineProxy } from '../../server/cadu-control-proxy.js';

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  return handleCaduPipelineProxy(req, res, req?.query?.path, { allowRoutingPathParam: true });
}
