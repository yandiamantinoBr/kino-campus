-- Add feed/profile-oriented indexes for posts lookups by author.
create index if not exists posts_author_id_idx
  on public.posts (author_id);

create index if not exists posts_author_id_created_at_idx
  on public.posts (author_id, created_at desc);
