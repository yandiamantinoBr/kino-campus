// Retired security tombstone.
//
// This endpoint previously exchanged credentials stored in Edge secrets for a
// reusable Auth session. A public project key satisfied the gateway JWT check,
// so the endpoint could become a credential oracle. Keep this fail-closed
// tombstone versioned to prevent a manual "deploy all" from restoring it.

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Allow": "POST, OPTIONS",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error: "endpoint_retired",
      message: "This authentication endpoint is permanently unavailable.",
    }),
    {
      status: 410,
      headers: HEADERS,
    },
  );
});
