type ActiveSessionRpcResult = {
  data: unknown;
  error: unknown;
};

export type ActiveSessionRpcClient = {
  rpc(
    functionName: "kc_is_current_session_active",
  ): PromiseLike<ActiveSessionRpcResult>;
};

/**
 * Confirms that the caller JWT still maps to a live auth.sessions row.
 *
 * Supabase access tokens remain cryptographically valid until they expire, even
 * after the underlying session is revoked. Sensitive Edge Functions therefore
 * call this user-scoped RPC before creating or using a service-role client.
 * Any transport, PostgREST, permission, or shape failure is denied.
 */
export async function isCurrentSessionActive(
  client: ActiveSessionRpcClient,
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("kc_is_current_session_active");
    return error == null && data === true;
  } catch (_) {
    return false;
  }
}
