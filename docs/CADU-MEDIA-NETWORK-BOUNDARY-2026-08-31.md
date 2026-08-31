# Cadu media network boundary — 2026-08-31

## Confirmed defect and authorization boundary

On Kino `a4cd5491`, `officialPageCandidates` accepted private/loopback IPs,
numeric encodings of IPv4, `localhost.` and nonstandard ports. Its page fetch
followed redirects automatically. `downloadImage` had the same unrestricted
destination/redirect behavior; failed uploads could persist the original URL as
external fallback. A single oversized response chunk also bypassed the
advertised 512 KB page-read budget. All were reproduced locally with in-memory
responses; no private-network endpoint was contacted.

This was **not an unauthenticated public endpoint**: `handleRequest` requires a
valid user, active session, and `kc_trusted_publishers` membership before
dispatch. The risk is untrusted scraped/enriched URLs crossing that
authenticated boundary. Auth, ownership, editorial quality, signed review,
deduplication, dates and the academic-board fallback are unchanged.

There is no `cadu-publish/image-handler.ts` in this revision. The actual paths
are `index.ts` → `official-cover.ts` and `index.ts` → image download/rehost.
`append_description_section` is not an edit field.

## Scoped change

- Shared pure URL/literal checks for both media and pages: HTTP(S) only; pages
  require HTTPS; no credentials, controls, backslashes, nonstandard ports,
  private/local/reserved IPv4 or IPv6, or special/internal DNS suffixes.
- DNS A and AAAA records must all be public before each GET, including every
  redirect. Empty results, resolver/permission failures and timeout fail closed.
  An authoritative `NotFound` for one family is allowed only if the other family
  supplies public addresses.
- Manual redirects: at most three hops, loop detection, no HTTPS downgrade, no
  authentication/cookies forwarded. Unexpected auto-followed responses are
  rejected. These limits share the original request deadline.
- Page lookup retains at most two linked candidates, 6-second default timeout,
  and exactly 512 KB of retained HTML, including a large single chunk. Case in
  URL paths is preserved during deduplication.
- Image downloads retain the existing 8-second/8-MB defaults and rehost
  contract, but enforce byte limits while reading, before buffering overflow.
- A safety error cannot become an external image fallback. Existing media is
  preserved if all replacements fail. A genuine storage failure after a safe
  download can still use the existing stable-external fallback.
- New posts are inserted without the mapper's unverified candidate media; only
  the validated rehost/fallback path writes canonical image fields. Otherwise a
  later DNS or redirect rejection would leave the candidate URL published.
- No crawler expansion, inferred official-source identity, new generic image,
  transport/proxy infrastructure, or production mutation.

## Important residual limitation

This is **DNS preflight validation, not DNS pinning**. Native `fetch` resolves
the hostname again; the DNS-check-to-connection TOCTOU/rebinding window remains.
Do not describe this patch as complete DNS-rebinding prevention. The Supabase
runtime exports `resolveDns` and `createHttpClient`, but its vendored transport
does not establish compatibility with the newer Deno TCP-proxy pinning API.
Introducing a new proxy/transport requires separate design and deployment proof.

The source-page candidate list still trusts upstream `sourceUrl`, `url` and
`enrichmentSources` as editorial bindings; this patch establishes network
safety, not authenticity of every page on a public hostname. The existing
MIME/extension image-type fallback is likewise not a content-signature validator
and is not changed in this scoped patch.

Official runtime references inspected:

- [Supabase Edge runtime overview](https://supabase.com/docs/guides/functions)
- [Supabase runtime Deno exports](https://github.com/supabase/edge-runtime/blob/main/ext/runtime/js/denoOverrides.js)
- [Supabase vendored proxy transport](https://github.com/supabase/edge-runtime/blob/main/vendor/deno_fetch/proxy.rs)
- [Deno networking API](https://docs.deno.com/api/deno/network/)
- [Supabase network restrictions](https://supabase.com/docs/guides/platform/network-restrictions)
  concern Postgres/pooler, not an outbound Edge Function SSRF guarantee.

The Supabase changelog index was fetched and checked for relevant breaking
changes; no platform setting or runtime upgrade is introduced here.

## Verification

Tests use injected DNS/HTTP responses and do not contact private networks.
Coverage includes disguised IPv4, IPv6/mapped/local/reserved ranges, mixed DNS
answers, resolver failures, safe/unsafe redirects, redirect cycles and caps,
stalled DNS/body deadlines, over-budget chunks, supported official platforms,
canonical edit media preservation, safe storage fallback and no-fetch dry-run.

Local results: all Edge tests **143/143**, full Jest **338 suites / 5,757 tests
passed** (7 skipped; 3 snapshots passed), `deno check` for the publisher, repository
hygiene, staged diff check and secret scan of all nine changed files passed.

Read-only real-source probes with the new runtime helper, 2026-08-31:

| Source                                                                                                                                                   | Result                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [PROSA official article](https://posgraduacao.if.ufg.br/n/203511-prosa-estreia-com-relatos-de-estudantes-que-realizaram-doutorado-sanduiche-no-exterior) | Official series OG cover found; 2.29 s                                  |
| [Even3 linked XI encounter](https://www.even3.com.br/xi-encontro-nacional-de-pesquisa-em-direito-e-politicas-publicas-772104/)                           | Official event cover found; 3.08 s                                      |
| [Plateia 23 CONPEEX](https://23conpeex.plateia.ufg.br/)                                                                                                  | No OG cover, as expected; 0.98 s; its body banners are handled upstream |
| [CERCOMP PROSA series cover](https://files.cercomp.ufg.br/weby/up/7/o/2.png?1786556262)                                                                  | PNG, 47,143 bytes, 0.32 s                                               |
| [CERCOMP Café com Ciência series cover](https://files.cercomp.ufg.br/weby/up/7/o/CafeComCiencia-Capa.png?1755735200)                                     | PNG, 14,694 bytes, 0.07 s                                               |

These probes validate local compatible Deno execution, not a deployed Edge
Function. Parent task owns deployment and canonical-image backfill.
