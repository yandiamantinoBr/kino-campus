# Self-paced courses: source deadline versus verification expiry

Manually inspected on 2026-08-31:

- IPTSP/UFG article: https://iptsp.ufg.br/n/203499
- Its linked course: https://cursosqualificacao.campusvirtual.fiocruz.br/hotsite/leptospirosetdtp/login
- Course presentation: https://cursosqualificacao.campusvirtual.fiocruz.br/hotsite/leptospirosetdtp/8952

The official portal identifies the Leptospirose course as online,
self-instructional, 30 hours / three modules, with a 30,000-place capacity.
It exposes an open-registration flag and requires a Fiocruz account. The
inspection did not create an account, submit a form or enroll anyone.
No final deadline was stated. That is not evidence of permanent availability.

## Contract

Only `web.ufg.iptsp`, article 203499, course `leptospirosetdtp:1365` can use
`cadu-self-paced-course-v1`. The publisher must supply current evidence from
all three exact URLs, the agreed stable semantic digest, available capacity,
an open authenticated-portal action, and no conflicting finite date roles.
Wrong sources, dates, availability, course IDs, receipts or expired evidence
fail closed in schema validation and mapping. Other undated records are not
promoted to this mode.

The public metadata says `no_final_deadline_informed`. No final enrollment
date or event date is inferred from incidental dates in prose. The UI states
**Sem prazo final informado**, displays the verification date and qualifies
availability by places and course rules. After 24 hours, it asks for another
availability check. It never displays the operational expiry as a course
deadline or promises indefinite enrollment.

The proof expires after 72 hours. `posts.expires_at` uses that verification
boundary rather than the database's default 30 days. The companion OpenClaw
change is responsible for bounded rechecks and signed, guarded renewal of the
same canonical post. Failure to obtain fresh evidence must not extend the
expiry; closed, hidden or manually locked posts must never be resurrected.
This frontend/Edge change alone does not schedule checks or publish a course.

The ordinary relevance threshold, review/approval proof, deduplication, source
revision and image requirements remain independent gates. For example, a
continuous-flow grant with an explicit 2027 deadline and a four-session course
ending in November are finite opportunities, not self-paced exceptions.

Regression coverage includes valid mapping, strict identity/receipts/capacity,
conflicting dates, exact TTL boundaries, future-clock abuse, legacy behavior,
display of the recheck warning, and separation from technical expiry.
