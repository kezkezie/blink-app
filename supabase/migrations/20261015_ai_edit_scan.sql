-- Edit with AI keeps its scan on the post (Kezie, 2026-10-15: "when the AI picks all the elements
-- of the image, and after we go over to another page, we don't want the page to remove all those
-- images that it has picked because that would be like a waste of credits. So we need to cache it").
-- { source: the image url it describes, scan: { scene, light, objects[] }, at, from: "scan" | "edit" }.
-- Written by the server only; an edit's result post starts with the scan it was made from.
alter table public.content add column if not exists xray jsonb;
