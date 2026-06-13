-- 012：文档插图的 Supabase Storage —— public bucket `doc-images`（加法：解锁图片插入）
-- 团队工具、无隐私(P2)，公开读最简单：getPublicUrl → ![](url) 全团队直接显示。
-- 上传路径约定：`{uid}/{文件名}`（每人自己的文件夹）。
-- Supabase 控制台 → SQL Editor 整段运行（幂等）。

insert into storage.buckets (id, name, public)
values ('doc-images', 'doc-images', true)
on conflict (id) do update set public = true;

-- 读：公开（bucket public 已可匿名读，显式 select 兜底）
drop policy if exists doc_images_read on storage.objects;
create policy doc_images_read on storage.objects for select to public
  using (bucket_id = 'doc-images');

-- 传：登录用户只能传到自己的文件夹 {uid}/...
drop policy if exists doc_images_insert on storage.objects;
create policy doc_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 改/删：只能动自己上传的（owner 自动 = auth.uid()）
drop policy if exists doc_images_update on storage.objects;
create policy doc_images_update on storage.objects for update to authenticated
  using (bucket_id = 'doc-images' and owner = auth.uid());
drop policy if exists doc_images_delete on storage.objects;
create policy doc_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'doc-images' and owner = auth.uid());
