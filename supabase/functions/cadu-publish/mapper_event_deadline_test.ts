import assert from "node:assert/strict";
import { mapItemToPost } from "./mapper.ts";
import type { CaduItem } from "./schema.ts";

const event: CaduItem = {
  module: "eventos", category: "academicos", title: "Defesa publica de dissertação",
  description: "Sessão pública em 20 de setembro de 2099, sem inscrição prévia.",
  sourceUrl: "https://ufg.br/e/defesa-publica",
  dates: { eventStartsAt: "2099-09-20", eventEndsAt: "2099-09-21" },
};

Deno.test("event start never becomes an application deadline", () => {
  const mapped = mapItemToPost(event);
  assert.equal(mapped.row.metadata.deadline_date, "");
  assert.equal(mapped.row.metadata.data_evento, "2099-09-20");
  assert.equal(mapped.row.metadata.data_fim_evento, "2099-09-21");
  assert.equal(mapped.row.expires_at, "2099-09-22T02:59:59.999Z");
});

Deno.test("explicit event application deadline stays separate from event dates and technical expiry", () => {
  for (const deadline of ["2099-09-10", "2099-09-20"]) {
    const mapped = mapItemToPost({ ...event, dates: { ...event.dates, applicationDeadline: deadline } });
    assert.equal(mapped.row.metadata.deadline_date, deadline);
    assert.equal(mapped.row.metadata.data_evento, "2099-09-20");
    assert.equal(mapped.row.metadata.data_fim_evento, "2099-09-21");
    assert.equal(mapped.row.expires_at, "2099-09-22T02:59:59.999Z");
  }
});

Deno.test("event deadline uses normalized semantic aliases, never secondary results or legacy event fields", () => {
  const withAlias = mapItemToPost({ ...event, application_deadline: "2099-09-12" });
  assert.equal(withAlias.row.metadata.deadline_date, "2099-09-12");
  const cleared = mapItemToPost({ ...event, deadlineDate: "2099-09-19", dates: {
    ...event.dates, applicationDeadline: null, resultPublishedAt: "2099-09-30",
  } });
  assert.equal(cleared.row.metadata.deadline_date, "");
  const legacy = mapItemToPost({ ...event, dates: undefined, dateStart: "2099-09-20", dateEnd: "2099-09-21" });
  assert.equal(legacy.row.metadata.deadline_date, "");
  assert.equal(legacy.row.metadata.data_evento, "2099-09-20");
});
