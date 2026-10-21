-- Which caption posts (long or short) is saved with the post, and whether a real caption was
-- written (by the person or the AI). Posts start with a working title in `caption` ("Container",
-- "Inspo Remix"); scheduling one that only has its working title asks for a caption first.
alter table public.content
  add column if not exists caption_choice text not null default 'long' check (caption_choice in ('long', 'short')),
  add column if not exists caption_written boolean not null default false;

update public.content set caption_written = true
where postforme_tracking_id is not null
   or status in ('posted', 'published')
   or coalesce(trim(caption_short), '') <> ''
   or ai_model = 'caption-ai';
