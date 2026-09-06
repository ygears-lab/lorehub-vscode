-- 20260829053401_create_md_table.sql のコメントは「folder_id等の整理系カラムは次スライスで追加予定」と
-- 述べていたが、フォルダはPhase 1スコープから外す判断になったため（docs/requirements.md §9を参照）、
-- 事実と食い違わないようコメントだけを差し替える。適用済みマイグレーション自体は書き換えない。
comment on table public.md is
  '整理はラベル(labels / md_labels)のみで行う。階層フォルダはPhase 1スコープ外のためfolder_idカラムは持たない。content_hashは将来の重複検知用に予約したカラムで、現時点では書き込まない。';
