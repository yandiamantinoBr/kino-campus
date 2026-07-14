// Strict rewrite target for /api/cadu/openclaw/(.+) -> ?path=$1.

import { handleCaduOpenclawProxy } from '../../server/cadu-control-proxy.js';

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  return handleCaduOpenclawProxy(req, res, req?.query?.path, { allowRoutingPathParam: true });
}
