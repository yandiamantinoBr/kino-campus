import UserTags = require('../../assets/js/shared/kc-post-user-tags.shared.js');

const normalized = UserTags.normalize(['Direito', 'Concursos']);
const labels: string[] = normalized.tags;
const keys: string[] = normalized.tagKeys;

const standardLimit: number = UserTags.limitFor(false);
const privilegedLimit: number = UserTags.limitFor(true);

const checked = UserTags.validate(labels, {
  limit: standardLimit,
  allowExistingOverflow: true,
  initialTags: labels,
});
const validationOk: boolean = checked.ok;

const readResult = UserTags.read({
  metadata: {
    userTags: labels,
  },
});
const readSource: 'canonical' | 'legacy' | 'none' = readResult.source;
const legacyFlag: boolean = readResult.isLegacy;

const patch = UserTags.metadataPatch(keys, { isPrivileged: privilegedLimit === 12 });
const patchOk: boolean = patch.ok;

// @ts-expect-error O limite privilegiado é decidido por boolean, não por papel textual.
UserTags.limitFor('admin');

// @ts-expect-error Opções desconhecidas não podem atravessar o contrato público.
UserTags.validate([], { preserveSilently: true });

void [labels, keys, validationOk, readSource, legacyFlag, patchOk];
