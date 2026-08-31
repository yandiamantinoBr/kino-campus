import assert from "node:assert/strict";
import { selfPacedValidityForItem } from "./self-paced-validity.ts";
import { mapItemToPost } from "./mapper.ts";
import { validateItem, type CaduItem } from "./schema.ts";

const ROOT = "https://iptsp.ufg.br/n/203499";
const PORTAL = "https://cursosqualificacao.campusvirtual.fiocruz.br/hotsite/leptospirosetdtp/";
function fixture(checked = new Date(Date.now() - 1000)): CaduItem {
  return {
    module: "oportunidades", category: "cursos-capacitacoes", sourceRegistryId: "web.ufg.iptsp",
    sourceUrl: ROOT, sourceRevision: "a".repeat(64), link: PORTAL + "login",
    title: "IPTSP INDICA - Fiocruz oferece curso online gratuito sobre leptospirose",
    description: "Curso online autoinstrucional, com 30h em 3 módulos. Sem prazo final informado; disponibilidade sujeita às vagas e às regras do portal.",
    dates: {
      applicationWindowMode: "self_paced_no_deadline", applicationStatus: "open", canApply: true,
      applicationPurpose: "registration", applicationMethod: "authenticated_portal",
      verifiedSelfPacedCourse: {
        contract: "cadu-self-paced-course-v1", sourceRegistryId: "web.ufg.iptsp", sourceUrl: ROOT,
        courseUrl: PORTAL + "login", presentationUrl: PORTAL + "8952", courseKey: "leptospirosetdtp:1365",
        checkedAt: checked.toISOString(), nextCheckAt: new Date(checked.getTime() + 86400000).toISOString(),
        verificationExpiresAt: new Date(checked.getTime() + 259200000).toISOString(),
        availability: "available", deadlineStatus: "not_informed", capacity: { total: 30000, enrolled: 16323 },
        evidenceDigest: "5e6c4dc953a90ff02f664d89a59bb75655a827d08f3663bc02fe2ab3f19ee223",
        sources: [ROOT, PORTAL + "login", PORTAL + "8952"].map(url => ({ url, sha256: "b".repeat(64) })),
      },
    },
  };
}
function proof(item: CaduItem): Record<string, unknown> {
  return item.dates!.verifiedSelfPacedCourse as Record<string, unknown>;
}

Deno.test("self-paced course maps no invented deadline and has a 72h verification expiry", () => {
  const item = fixture();
  assert.equal(validateItem(item).ok, true);
  const mapped = mapItemToPost(item);
  assert.equal(mapped.row.metadata.deadline_date, "");
  assert.equal(mapped.row.expires_at, proof(item).verificationExpiresAt);
  assert.deepEqual(mapped.row.metadata.dates, { applicationWindowMode: "self_paced_no_deadline" });
  assert.equal((mapped.row.metadata.validity as Record<string, unknown>).mode, "no_final_deadline_informed");
  assert.equal(mapped.row.metadata.data_evento, undefined);
});

Deno.test("source scope, course identity, receipts and availability are fail-closed", () => {
  const mutations: Array<(item: CaduItem) => void> = [
    item => { item.module = "eventos"; },
    item => { item.category = "editais"; },
    item => { item.sourceRegistryId = "web.ufg.ciar"; },
    item => { item.sourceUrl = ROOT + "0"; },
    item => { item.sourceUrl = ROOT + "?course=1365"; },
    item => { item.link = PORTAL + "inscricao"; },
    item => { proof(item).courseKey = "leptospirosetdtp:1366"; },
    item => { proof(item).sourceUrl = "https://fiocruz.br/"; },
    item => { proof(item).availability = "closed"; },
    item => { proof(item).deadlineStatus = "unknown"; },
    item => { proof(item).capacity = { total: 30000, enrolled: 30000 }; },
    item => { proof(item).capacity = { total: 30000, enrolled: -1 }; },
    item => { proof(item).capacity = { total: 30000, enrolled: 1, deadline: "2026-08-01" }; },
    item => { proof(item).evidenceDigest = "a".repeat(64); },
    item => { proof(item).sources = [{ url: ROOT, sha256: "a".repeat(64) }]; },
    item => { proof(item).sources = [ROOT, ROOT, ROOT].map(url => ({ url, sha256: "b".repeat(64) })); },
    item => { (proof(item).sources as Array<Record<string, unknown>>)[0].extra = "unsupported"; },
    item => { proof(item).extra = "unsupported"; },
    item => { item.dates!.canApply = false; },
    item => { item.dates!.applicationMethod = "email"; },
    item => { item.expired = true; },
    item => { item.isExpired = true; },
    item => { item.dates!.application_status = "closed"; },
    item => { item.dates!.can_apply = false; },
  ];
  for (const mutate of mutations) {
    const item = fixture(); mutate(item);
    assert.throws(() => mapItemToPost(item), /self_paced_course_validity_invalid/);
    assert.equal(validateItem(item).ok, false);
  }
});

Deno.test("finite and conflicting date roles never get the no-deadline contract", () => {
  for (const key of ["applicationDeadline", "applicationOpensAt", "eventStartsAt", "eventEndsAt", "deadlineDate", "dateEnd", "resultPublishedAt", "start", "end", "date_start", "date_end", "data_evento", "data_fim_evento"]) {
    for (const placement of ["root", "dates"]) {
      const item = fixture();
      (placement === "root" ? item : item.dates!)[key] = "2027-08-01";
      assert.equal(validateItem(item).ok, false, placement + "." + key);
    }
  }
});

Deno.test("availability expires strictly and cannot extend itself by supplied timestamps", () => {
  const now = new Date("2026-08-31T15:00:00.000Z");
  const current = fixture(now);
  assert.ok(selfPacedValidityForItem(current, now));
  assert.ok(selfPacedValidityForItem(current, new Date(now.getTime() + 259199999)));
  assert.throws(() => selfPacedValidityForItem(current, new Date(now.getTime() + 259200000)));
  assert.throws(() => selfPacedValidityForItem(fixture(new Date(now.getTime() + 300001)), now));
  for (const key of ["nextCheckAt", "verificationExpiresAt"]) {
    const item = fixture(now); proof(item)[key] = "2027-08-31T15:00:00.000Z";
    assert.throws(() => selfPacedValidityForItem(item, now));
  }
});

Deno.test("other undated content retains legacy mapping and gains no availability label", () => {
  const item: CaduItem = { module: "oportunidades", category: "cursos-capacitacoes", title: "Outro curso", description: "Informação sem prazo." };
  const mapped = mapItemToPost(item);
  assert.equal(mapped.row.metadata.validity, undefined);
  assert.equal(mapped.row.expires_at, undefined);
  assert.equal(selfPacedValidityForItem(item), null);
  assert.equal(selfPacedValidityForItem({ ...item, dates: { verifiedSelfPacedCourse: null } }), null);
});
