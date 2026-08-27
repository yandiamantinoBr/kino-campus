import type {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './supabase.generated';

export type PostRow = Tables<'posts'>;
export type PostInsert = TablesInsert<'posts'>;
export type PostUpdate = TablesUpdate<'posts'>;
export type PostMediaRow = Tables<'post_media'>;

export type PostActorKind = 'member' | 'admin' | 'agent';

type TupleUpTo<
  Item,
  Maximum extends number,
  Accumulator extends readonly Item[] = readonly [],
> = Accumulator['length'] extends Maximum
  ? Accumulator
  : Accumulator | TupleUpTo<Item, Maximum, readonly [...Accumulator, Item]>;

/**
 * Tags livres adicionadas pelo usuário, separadas das taxonomias canônicas.
 * O banco continua sendo a autoridade de runtime para normalização e limites.
 */
export type UserTagsFor<Actor extends PostActorKind> = Actor extends 'member'
  ? TupleUpTo<string, 6>
  : TupleUpTo<string, 12>;

/** Metadata conhecida sem esconder campos históricos ainda não migrados. */
export type PostMetadata = {
  userTags?: string[];
  user_tags?: string[];
  gallery_image_urls?: string[];
  galleryImageUrls?: string[];
  image_urls?: string[];
  source_url?: string;
  sourceUrl?: string;
  deadline_date?: string | number | null;
  applicationPurpose?: string;
  [key: string]: Json | undefined;
};

/**
 * A ausência de metadata preserva o JSON atual; metadataPatch representa merge,
 * nunca substituição cega do objeto completo.
 */
export type PostPatch = Omit<PostUpdate, 'metadata'> & {
  metadataPatch?: Partial<PostMetadata>;
};

/** Torna a intenção preservar/substituir Tags explícita no boundary de escrita. */
export type UserTagsMutation<Actor extends PostActorKind> =
  | { mode: 'preserve' }
  | { mode: 'replace'; userTags: UserTagsFor<Actor> };

export type NormalizedPostMedia = Pick<
  PostMediaRow,
  'id' | 'is_cover' | 'sort_order' | 'url'
>;

/** Forma validada esperada depois da normalização da linha Supabase. */
export interface NormalizedPost {
  id: string;
  title: string;
  description: string;
  module: string | null;
  category: string | null;
  location: string | null;
  price: number | null;
  imageUrl: string | null;
  metadata: PostMetadata;
  media: readonly NormalizedPostMedia[];
  userTags: readonly string[];
}
