import type {
  NormalizedPost,
  PostInsert,
  PostPatch,
  PostUpdate,
  UserTagsFor,
  UserTagsMutation,
} from '../posts.contracts';

const insertWithRequiredTitle: PostInsert = { title: 'Evento acadêmico' };
const partialUpdate: PostUpdate = { location: 'Campus Samambaia' };
const metadataPreservingPatch: PostPatch = { title: 'Título revisado' };
const metadataMergePatch: PostPatch = { metadataPatch: { source_url: 'https://ufg.br/' } };

const sixMemberTags: UserTagsFor<'member'> = [
  'Direito',
  'Concursos',
  'UFG',
  'Instituto Verbena',
  'Presencial',
  'Goiânia',
] as const;

const twelvePrivilegedTags: UserTagsFor<'admin'> = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
] as const;

const preserveExistingTags: UserTagsMutation<'member'> = { mode: 'preserve' };
const replaceMemberTags: UserTagsMutation<'member'> = {
  mode: 'replace',
  userTags: ['Direito', 'UFG'] as const,
};

// @ts-expect-error inserts de posts sempre exigem título
const insertWithoutTitle: PostInsert = {};

// @ts-expect-error usuários comuns não podem enviar uma sétima tag
const sevenMemberTags: UserTagsFor<'member'> = [
  '01', '02', '03', '04', '05', '06', '07',
] as const;

// @ts-expect-error administradores/agentes não podem enviar uma décima terceira tag
const thirteenAgentTags: UserTagsFor<'agent'> = [
  '01', '02', '03', '04', '05', '06', '07',
  '08', '09', '10', '11', '12', '13',
] as const;

declare const untrustedPayload: unknown;
// @ts-expect-error dados externos precisam ser normalizados antes de virarem NormalizedPost
const unsafeNormalizedPost: NormalizedPost = untrustedPayload;

export type ContractFixtures = {
  insertWithRequiredTitle: typeof insertWithRequiredTitle;
  partialUpdate: typeof partialUpdate;
  metadataPreservingPatch: typeof metadataPreservingPatch;
  metadataMergePatch: typeof metadataMergePatch;
  sixMemberTags: typeof sixMemberTags;
  twelvePrivilegedTags: typeof twelvePrivilegedTags;
  preserveExistingTags: typeof preserveExistingTags;
  replaceMemberTags: typeof replaceMemberTags;
  insertWithoutTitle: typeof insertWithoutTitle;
  sevenMemberTags: typeof sevenMemberTags;
  thirteenAgentTags: typeof thirteenAgentTags;
  unsafeNormalizedPost: typeof unsafeNormalizedPost;
};
