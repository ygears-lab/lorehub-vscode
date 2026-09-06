-- テーブルへのGRANTを明示する。
--
-- RLSはあくまで「行を絞る」仕組みであり、その手前にあるテーブル権限を代替しない。
-- 権限が無ければ、ポリシーが正しくても Postgres は 42501 (permission denied for table ...)
-- を返す。ローカルスタックではデフォルト権限が効いていて気づけず、
-- 本番でのみ発覚するため、スキーマ側に明示して環境差を無くす。
--
-- 付与する操作は、各テーブルのRLSポリシーと一致させている。
-- ポリシーが存在しない操作に権限だけ与えても、RLSで拒否されるため無意味であり、
-- 「どの操作を意図しているか」がスキーマから読み取れなくなる。

grant usage on schema public to authenticated;

-- md: 削除は常にソフトデリート(update)経由で行うため、deleteは与えない。
-- 20260829053401 でdeleteポリシーを意図的に定義していないのと同じ理由。
grant select, insert, update on table public.md to authenticated;

-- labels: タグ自体に保持すべき履歴価値がないため、物理削除を許可している。
grant select, insert, update, delete on table public.labels to authenticated;

-- md_labels: 割り当ての変更は常にinsert/deleteの組み合わせで表現するため、updateは与えない。
grant select, insert, delete on table public.md_labels to authenticated;
