-- Foto della dieta: spazio privato, ogni utente vede solo la propria cartella
insert into storage.buckets (id, name, public) values ('diets', 'diets', false) on conflict (id) do nothing;
drop policy if exists "diets own read" on storage.objects;
create policy "diets own read" on storage.objects for select to authenticated using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "diets own insert" on storage.objects;
create policy "diets own insert" on storage.objects for insert to authenticated with check (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "diets own update" on storage.objects;
create policy "diets own update" on storage.objects for update to authenticated using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "diets own delete" on storage.objects;
create policy "diets own delete" on storage.objects for delete to authenticated using (bucket_id = 'diets' and (storage.foldername(name))[1] = auth.uid()::text);
