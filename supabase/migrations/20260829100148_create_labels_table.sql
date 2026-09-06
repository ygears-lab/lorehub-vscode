create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labels_name_not_blank check (btrim(name) <> ''),
  constraint labels_user_name_unique unique (user_id, name)
);

alter table public.labels enable row level security;

create policy "labels_select_own" on public.labels
  for select using (auth.uid() = user_id);

create policy "labels_insert_own" on public.labels
  for insert with check (auth.uid() = user_id);

create policy "labels_update_own" on public.labels
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- mdと異なりlabelsはタグ自体に保持すべき履歴価値がないため、物理削除を許可する。
create policy "labels_delete_own" on public.labels
  for delete using (auth.uid() = user_id);

create trigger labels_set_updated_at
before update on public.labels
for each row execute function public.set_updated_at();

create table public.md_labels (
  md_id uuid not null references public.md(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (md_id, label_id)
);

create index md_labels_label_idx on public.md_labels (label_id);

alter table public.md_labels enable row level security;

create policy "md_labels_select_own" on public.md_labels
  for select using (
    exists (select 1 from public.md m where m.id = md_labels.md_id and m.user_id = auth.uid())
  );

create policy "md_labels_insert_own" on public.md_labels
  for insert with check (
    exists (select 1 from public.md m where m.id = md_labels.md_id and m.user_id = auth.uid())
    and exists (select 1 from public.labels l where l.id = md_labels.label_id and l.user_id = auth.uid())
  );

create policy "md_labels_delete_own" on public.md_labels
  for delete using (
    exists (select 1 from public.md m where m.id = md_labels.md_id and m.user_id = auth.uid())
  );

-- updateポリシーは意図的に定義しない: 割り当ての変更は常にinsert/deleteの組み合わせで表現する。
