create table public.md (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  filename text not null default '',
  content text not null default '',
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint md_content_size_limit check (octet_length(content) <= 1048576)
);

comment on table public.md is
  'folder_id等の整理系カラムは次スライスで追加予定（既存レコードへのデフォルトフォルダbackfill後にNOT NULL制約を付与する）。content_hashは将来の重複検知用に予約したカラムで、現時点では書き込まない。';

create index md_user_active_idx on public.md (user_id, updated_at desc) where deleted_at is null;

alter table public.md enable row level security;

create policy "md_select_own" on public.md
  for select using (auth.uid() = user_id);

create policy "md_insert_own" on public.md
  for insert with check (auth.uid() = user_id);

create policy "md_update_own" on public.md
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- deleteポリシーは意図的に定義しない: アプリからは常にソフトデリート(update)経由でのみ削除するため、
-- RLS的にも物理deleteはデフォルト拒否のままにしておく。

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger md_set_updated_at
before update on public.md
for each row execute function public.set_updated_at();
