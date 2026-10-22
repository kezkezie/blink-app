-- products had RLS enabled but NO policy (Supabase security advisor, 2026-10-22), so every
-- browser read returned nothing. Video Inspo (keyframes) and the X-ray editor's product picker read
-- products with the anon client, so product images silently never loaded there. brand_profiles and
-- content already carry owner + shared-member policies; products was missed. Mirror content's set
-- exactly (products has both client_id and brand_id). Purely additive: the service role used by the
-- server bypasses RLS and is unaffected.

-- Owner: full access to their own products.
drop policy if exists "Users see own products" on public.products;
create policy "Users see own products" on public.products
  for all
  using (client_id in (select clients.id from public.clients where clients.user_id = auth.uid()));

-- Shared-brand members: read.
drop policy if exists products_member_read on public.products;
create policy products_member_read on public.products
  for select
  using (
    brand_id in (select my_shared_brand_ids())
    and client_id in (select my_shared_client_ids())
  );

-- Shared-brand editors: insert / update / delete, scoped to the owner's client.
drop policy if exists products_editor_insert on public.products;
create policy products_editor_insert on public.products
  for insert
  with check (brand_id in (select my_shared_brand_ids(true)) and client_id = shared_brand_client(brand_id));

drop policy if exists products_editor_update on public.products;
create policy products_editor_update on public.products
  for update
  using (brand_id in (select my_shared_brand_ids(true)) and client_id = shared_brand_client(brand_id))
  with check (brand_id in (select my_shared_brand_ids(true)) and client_id = shared_brand_client(brand_id));

drop policy if exists products_editor_delete on public.products;
create policy products_editor_delete on public.products
  for delete
  using (brand_id in (select my_shared_brand_ids(true)) and client_id = shared_brand_client(brand_id));
