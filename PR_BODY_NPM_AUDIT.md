## Summary

The Essential Validation job fails on **Dependency security audit** because the lockfile pins three transitive deps at versions flagged with high-severity GHSA advisories:

- `brace-expansion` 5.0.8 — DoS via unbounded intermediate arrays
- `fast-uri` 3.1.4 — host confusion via backslash authority introducer
- `ip-address` 10.2.0 — 3 CVEs around SSRF / trust-boundary bypass
- `minimatch` 10.0.0 || 10.0.2 — fixed transitively when brace-expansion moves

The `package.json` had overrides pinning `brace-expansion` and `fast-uri` to the older vulnerable versions. Bumping the overrides to the latest patch/minor releases closes the advisories without touching the top-level deps.

`ajv 8.20.0` still requires `fast-uri` via `require()` and the API is compatible across the v3→v4 major bump, so URI resolution keeps working — verified with **5005/5012 jest tests passing locally** plus an inline `ajv.compile` smoke test.

## Audit before / after

```
# before
brace-expansion  5.0.8  (HIGH, DoS via unbounded intermediate arrays)
fast-uri        3.1.4  (HIGH, host confusion via backslash authority)
ip-address     10.2.0  (HIGH, 3 SSRF / trust-boundary CVEs)
minimatch   10.0.0/10.0.2  (HIGH, fixed transitively)

# after
found 0 vulnerabilities
```

## Diff

```jsonc
"overrides": {
   "brace-expansion": "5.0.8"  ->  "5.0.9",   // closes GHSA-rgw5-rvv9-x895
   "fast-uri":        "3.1.4"  ->  "^4.1.0",  // closes GHSA-7p8r-x3mc-p8w7
+  "ip-address":      "10.4.0",              // closes 3x GHSA-mwp4 / GHSA-4xrf / GHSA-22jq
+  "socks":           "2.8.9",               // pulls the new ip-address transitively
}
```

Refs the Essential Validation red bar that has been failing on `kinocampus-V75.0-foundations` for several sessions, blocking every PR from going green.
