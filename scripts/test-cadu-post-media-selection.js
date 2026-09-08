"use strict";
// Real PostgreSQL tests, FIXED disposable local DB only. No production credentials.
// Synthetic verifier receipts exercise the service-role SQL boundary; they are not source-image evidence.
if (!process.argv.includes("--local")) {
  throw Error("Use --local for the fixed disposable database.");
}
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { spawnSync, spawn } = require("node:child_process");
const DB = "cadu_integrity_cas_20260908", CONTAINER = "supabase_db_kino-campus";
const host = process.platform === "win32"
  ? "npipe:////./pipe/dockerDesktopLinuxEngine"
  : "unix:///var/run/docker.sock";
const base = [
  "--host",
  host,
  "exec",
  "-i",
  CONTAINER,
  "psql",
  "-X",
  "-U",
  "postgres",
  "-d",
  DB,
  "-v",
  "ON_ERROR_STOP=1",
  "-A",
  "-t",
  "-q",
];
const postId = "00000000-0000-4000-8000-00000000c701",
  owner = "2345582d-8bf7-4393-aa0d-f9953d0e02ca";
const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function sql(code, allowError = false) {
  const r = spawnSync("docker", base, {
    input: code,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (r.status !== 0 && !allowError) throw Error(r.stderr);
  return r;
}
function asyncSql(code, onData = () => {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", base, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (v) => {
      out += v;
      onData(out);
    });
    p.stderr.on("data", (v) => err += v);
    p.on("error", reject);
    p.on(
      "close",
      (code) => resolve({ status: code, stdout: out.trim(), stderr: err }),
    );
    p.stdin.end(code);
  });
}
const j = (v) =>
  `convert_from(decode('${
    Buffer.from(JSON.stringify(v)).toString("base64")
  }','base64'),'UTF8')::jsonb`;
const read = (q) => JSON.parse(sql(q).stdout.trim());
const fields = [
  "id",
  "author_id",
  "created_at",
  "title",
  "description",
  "price",
  "location",
  "module",
  "category",
  "status",
  "visibility",
  "image_url",
  "expires_at",
  "updated_at",
  "metadata",
];
const snapshot = () =>
  read(
    `select jsonb_build_object(${
      fields.map((k) => `'${k}',${k}`).join(",")
    }) from public.posts where id='${postId}';`,
  );
const media = () =>
  read(
    `select coalesce(jsonb_agg(to_jsonb(m) order by sort_order,id),'[]') from public.post_media m where post_id='${postId}';`,
  );
const all = () =>
  read(
    `select jsonb_build_object('post',(select to_jsonb(p) from public.posts p where id='${postId}'),'media',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.post_media m where post_id='${postId}'),'audits',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.audit_log a where entity_id='${postId}'));`,
  );
assert.equal(sql("select current_database();").stdout.trim(), DB);
const dir = path.join(__dirname, "../supabase/migrations");
const migrations = fs.readdirSync(dir).filter((n) =>
  n.endsWith("_cadu_post_media_selection_cas.sql")
);
assert.equal(migrations.length, 1);
sql(fs.readFileSync(path.join(dir, migrations[0]), "utf8"));
const results = [];
function verifyEdge(receipt, current, input, proofs) {
  const r = spawnSync("deno", [
    "run",
    "--no-lock",
    "--cached-only",
    "--node-modules-dir=auto",
    path.join(__dirname, "verify-cadu-media-selection-receipt.ts"),
  ], {
    input: JSON.stringify({ receipt, current, input, proofs }),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /receipt_verified/);
}
function fixture(extra = {}) {
  const rows = [0xc710, 0xc711, 0xc712, 0xc713].map((n, i) => ({
    id: id(n),
    post_id: postId,
    url: `https://files.cercomp.ufg.br/weby/up/1/o/db-synthetic-${n}.png`,
    is_cover: i === 0,
    sort_order: [0, 0, 0, 1][i],
    created_at: "2026-09-01T12:00:00.123456Z",
  }));
  const value = {
    id: postId,
    author_id: owner,
    title: "Synthetic DB media selection",
    description: "Preserve all factual text.",
    price: 150,
    location: "Goiânia",
    module: "oportunidades",
    category: "mestrado",
    status: "published",
    visibility: "public",
    image_url: rows[0].url,
    expires_at: "2020-09-18T19:00:00Z",
    metadata: {
      source_id: "db:media-test",
      source_url: "https://ufg.br/n/1",
      source_registry_id: "web.ufg.fixture",
      source_revision: "e".repeat(64),
      image_url: rows[0].url,
      cover_url: rows[0].url,
      gallery_image_urls: rows.map((r) => r.url),
      gallery_count: 4,
      dates: { applicationDeadline: "2020-09-18", canApply: false },
      userTags: ["unchanged"],
      userTagKeys: ["unchanged"],
      arbitrary: { keep: true },
    },
    ...extra,
  };
  sql(`begin;set local session_replication_role=replica;
 delete from public.audit_log where entity_id='${postId}';delete from public.post_media where post_id='${postId}';delete from public.posts where id='${postId}';
 insert into public.profiles(id) values('${owner}') on conflict do nothing;
 insert into public.kc_trusted_publishers(user_id) values('${owner}') on conflict do nothing;
 insert into public.posts(${Object.keys(value).join(",")}) select ${
    Object.keys(value).join(",")
  } from jsonb_populate_record(null::public.posts,${j(value)});
 insert into public.post_media select * from jsonb_populate_recordset(null::public.post_media,${
    j(rows)
  });commit;`);
  const request = {
    contract: "cadu-edit-media-selection-v1",
    operation: "deduplicate",
    operationId: crypto.randomUUID(),
    expected: snapshot(),
    expectedRows: media(),
    reason: "Synthetic full byte duplicate verified by Edge mock.",
    pairs: [{
      removeId: id(0xc712),
      keepId: id(0xc713),
      sha256: "a".repeat(64),
    }],
  };
  return { request, proofs: [{ ...request.pairs[0], bytes: 1024 }], rows };
}
const expression = (f, actor = owner) =>
  `public.kc_cadu_select_post_media('${postId}','${actor}',${j(f.request)},${
    j(f.proofs)
  })`;
const execute = (f) => read(`set role service_role;select ${expression(f)};`);
function test(name, fn) {
  fn();
  results.push({ name, ok: true });
}
function rejects(name, mutate) {
  test(name, () => {
    const f = fixture();
    mutate(f);
    const before = all();
    const r = sql(`set role service_role;select ${expression(f)};`, true);
    if (r.status === 0) assert.equal(JSON.parse(r.stdout).ok, false);
    assert.deepEqual(all(), before);
  });
}
test("15+6 CAS deduplicate preserves every retained row/order, all scalars and non-gallery metadata", () => {
  const f = fixture(), before = all(), r = execute(f), after = all();
  assert.equal(r.ok, true);
  assert.equal(r.replayed, false);
  assert.equal(after.media.length, 3);
  verifyEdge(r, f.request.expected, f.request, f.proofs);
  assert.deepEqual(
    after.media,
    before.media.filter((x) => x.id !== id(0xc712)),
  );
  assert.deepEqual(after.media.map((x) => x.sort_order), [0, 0, 1]);
  for (const k of Object.keys(before.post)) {
    if (!["metadata", "updated_at"].includes(k)) {
      assert.deepEqual(after.post[k], before.post[k], k);
    }
  }
  const omit = (m) => {
    m = structuredClone(m);
    delete m.gallery_image_urls;
    delete m.gallery_count;
    delete m.cadu_media_selection_history;
    return m;
  };
  assert.deepEqual(omit(after.post.metadata), omit(before.post.metadata));
  assert.equal(after.audits.length, 1);
  assert.equal(
    after.post.expires_at,
    before.post.expires_at,
    "closed cutoff must not be reopened",
  );
});
test("identical retry uses durable receipt without updating post/media/audit", () => {
  const f = fixture();
  execute(f);
  const before = all(), current = snapshot();
  const r = execute({ ...f, proofs: [] });
  assert.equal(r.replayed, true);
  assert.deepEqual(all(), before);
  verifyEdge(r, current, f.request, []);
});
test("operation-ID reuse with changed request is conflict without writes", () => {
  const f = fixture();
  execute(f);
  const before = all();
  f.request.reason += " changed";
  const r = execute(f);
  assert.equal(r.code, "MEDIA_REPLAY_CONFLICT");
  assert.deepEqual(all(), before);
});
test("rollback restores exact original associations and appends history", () => {
  const f = fixture(), before = all();
  execute(f);
  const current = snapshot();
  const rollback = {
    contract: f.request.contract,
    operation: "rollback",
    operationId: crypto.randomUUID(),
    expected: current,
    expectedRows: media(),
    rollbackOf: f.request.operationId,
    reason: "Restore the exact previous gallery associations.",
  };
  const r = execute({ request: rollback, proofs: [] });
  assert.equal(r.ok, true);
  verifyEdge(r, current, rollback, []);
  const after = all();
  assert.deepEqual(after.media, before.media);
  assert.equal(after.post.metadata.cadu_media_selection_history.length, 2);
  assert.equal(after.audits.length, 2);
  for (const k of Object.keys(before.post.metadata)) {
    assert.deepEqual(after.post.metadata[k], before.post.metadata[k], k);
  }
});
rejects("missing snapshot field", (f) => delete f.request.expected.price);
rejects(
  "free patch is not an allowed input",
  (f) => f.request.patch = { price: 0 },
);
rejects("score is not an allowed input", (f) => f.request.score = 0.99);
rejects(
  "source identity cannot be rebound",
  (f) => f.request.expected.metadata.source_id = "other",
);
rejects(
  "stale microseconds",
  (f) => f.request.expected.updated_at = "2026-09-01T12:00:00.123457Z",
);
rejects(
  "changed media creation date",
  (f) => f.request.expectedRows[1].created_at = "2026-09-01T12:00:00.123457Z",
);
rejects(
  "four-field media snapshot",
  (f) => delete f.request.expectedRows[0].created_at,
);
rejects("incomplete gallery", (f) => f.request.expectedRows.pop());
rejects("cover removal", (f) => {
  f.request.pairs[0].removeId = id(0xc710);
  f.proofs[0].removeId = id(0xc710);
});
rejects("foreign media identity", (f) => {
  f.request.pairs[0].removeId = id(0xc999);
  f.proofs[0].removeId = id(0xc999);
});
rejects("missing verified byte receipt", (f) => f.proofs = []);
rejects("wrong full digest proof", (f) => f.proofs[0].sha256 = "b".repeat(64));
rejects("prefix digest is rejected", (f) => {
  f.request.pairs[0].sha256 = "a".repeat(8);
  f.proofs[0].sha256 = "a".repeat(8);
});
rejects("zero byte proof", (f) => f.proofs[0].bytes = 0);
rejects("oversized byte proof", (f) => f.proofs[0].bytes = 4194305);
rejects("chained deletion", (f) => {
  const p = {
    removeId: id(0xc713),
    keepId: id(0xc711),
    sha256: "a".repeat(64),
  };
  f.request.pairs.push(p);
  f.proofs.push({ ...p, bytes: 1024 });
});
for (const key of ["manual_edits_lock", "manual_description"]) {
  test(key + " prevents mutation", () => {
    const f = fixture();
    sql(
      `update public.posts set metadata=jsonb_set(metadata,'{${key}}','true') where id='${postId}';`,
    );
    f.request.expected = snapshot();
    const before = all();
    assert.notEqual(
      sql(`set role service_role;select ${expression(f)};`, true).status,
      0,
    );
    assert.deepEqual(all(), before);
  });
}
test("alias conflict does not fix cover silently", () => {
  const f = fixture();
  sql(
    `update public.posts set metadata=jsonb_set(metadata,'{cover_url}',to_jsonb('https://ufg.br/other.png'::text)) where id='${postId}';`,
  );
  f.request.expected = snapshot();
  const before = all();
  assert.notEqual(
    sql(`set role service_role;select ${expression(f)};`, true).status,
    0,
  );
  assert.deepEqual(all(), before);
});
test("public/authenticated cannot invoke service-only operation", () => {
  const f = fixture();
  for (const role of ["anon", "authenticated"]) {
    assert.notEqual(
      sql(`set role ${role};select ${expression(f)};`, true).status,
      0,
    );
  }
});
test("service role cannot select foreign actor", () => {
  const f = fixture();
  assert.notEqual(
    sql(`set role service_role;select ${expression(f, id(1))};`, true).status,
    0,
  );
});
test("forged history cannot authorize rollback", () => {
  const f = fixture();
  execute(f);
  const p = snapshot();
  p.metadata.cadu_media_selection_history[0].media_before.push({
    ...f.rows[1],
    id: id(0xc999),
    url: "https://ufg.br/arbitrary.png",
  });
  sql(
    `update public.posts set metadata=${j(p.metadata)} where id='${postId}';`,
  );
  const before = all();
  const r = execute({
    request: {
      contract: f.request.contract,
      operation: "rollback",
      operationId: crypto.randomUUID(),
      expected: snapshot(),
      expectedRows: media(),
      rollbackOf: f.request.operationId,
      reason: "Forged history must not restore arbitrary media.",
    },
    proofs: [],
  });
  assert.equal(r.ok, false);
  assert.deepEqual(all(), before);
});
// These triggers operate only on this fixture, inside a transaction that rolls back the test.
for (
  const kind of [
    "audit-fails",
    "audit-mutates-post",
    "audit-mutates-media",
    "delete-mutates-retained",
  ]
) {
  test("atomic " + kind, () => {
    const f = fixture(), before = all();
    const action = kind === "audit-fails"
      ? "raise exception 'deliberate audit failure' using errcode='23514';"
      : kind === "audit-mutates-post"
      ? `update public.posts set title='unexpected trigger rewrite' where id='${postId}';`
      : `update public.post_media set sort_order=88 where id='${id(0xc711)}';`;
    const target = kind === "delete-mutates-retained"
        ? "post_media"
        : "audit_log",
      event = kind === "delete-mutates-retained" ? "delete" : "insert";
    const condition = target === "post_media"
      ? `old.post_id='${postId}'::uuid`
      : `new.entity_id='${postId}'::uuid`;
    const code =
      `begin;create function pg_temp.media_selection_probe() returns trigger language plpgsql as $f$ begin ${action} return null;end;$f$;
 create trigger media_selection_test_trigger after ${event} on public.${target} for each row when (${condition}) execute function pg_temp.media_selection_probe();
 set local role service_role;select ${expression(f)};rollback;`;
    const r = sql(code, true);
    assert.notEqual(r.status, 0);
    assert.deepEqual(all(), before, "all effects must roll back");
  });
}
async function concurrency() {
  let f = fixture();
  const g = structuredClone(f);
  g.request.operationId = crypto.randomUUID();
  const workers = await Promise.all([
    asyncSql(`set role service_role;select ${expression(f)};`),
    asyncSql(`set role service_role;select ${expression(g)};`),
  ]);
  assert.ok(workers.every((r) => r.status === 0));
  const replies = workers.map((r) => JSON.parse(r.stdout));
  assert.equal(replies.filter((r) => r.ok).length, 1);
  assert.equal(replies.filter((r) => r.code === "EDIT_CONFLICT").length, 1);
  assert.equal(all().audits.length, 1);
  results.push({ name: "two workers: one commit and one stale CAS", ok: true });
  f = fixture();
  let readyResolve;
  const ready = new Promise((r) => readyResolve = r);
  const blocker = asyncSql(
    `begin;select id from public.posts where id='${postId}' for update;select 'LOCK_READY';select pg_sleep(1.5);update public.posts set metadata=metadata||'{"concurrent":true}' where id='${postId}';commit;`,
    (out) => {
      if (out.includes("LOCK_READY")) readyResolve();
    },
  );
  await ready;
  const waiting = await asyncSql(
    `set role service_role;select ${expression(f)};`,
  );
  await blocker;
  assert.equal(JSON.parse(waiting.stdout).code, "EDIT_CONFLICT");
  assert.equal(media().length, 4);
  results.push({
    name: "lock wait sees committed parent metadata change",
    ok: true,
  });
  f = fixture();
  let childResolve;
  const childReady = new Promise((r) => childResolve = r);
  const childBlock = asyncSql(
    `begin;select id from public.post_media where id='${
      id(0xc711)
    }' for update;select 'CHILD_READY';select pg_sleep(1.5);update public.post_media set sort_order=9 where id='${
      id(0xc711)
    }';commit;`,
    (out) => {
      if (out.includes("CHILD_READY")) childResolve();
    },
  );
  await childReady;
  const w = await asyncSql(`set role service_role;select ${expression(f)};`);
  await childBlock;
  assert.equal(JSON.parse(w.stdout).code, "EDIT_CONFLICT");
  assert.equal(media().length, 4);
  results.push({
    name: "lock wait sees changed child row and leaves gallery intact",
    ok: true,
  });
}
concurrency().then(() => {
  console.log(
    JSON.stringify(
      {
        localOnly: true,
        database: DB,
        migration: migrations[0],
        passed: results.length,
        results,
      },
      null,
      2,
    ),
  );
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
