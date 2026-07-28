-- Storefront-facing product fields + product image storage.
--
-- Admins manage these from the catalog page (/products): whether a product is
-- shown on the public shop, an optional "featured" (öne çıkan) highlight, a
-- short shop description, and a cover image. Images live in a dedicated public
-- Storage bucket; only the service role (admin server actions) writes to it.

alter table products
  -- Default true so the existing catalog stays visible on launch; admins turn
  -- individual products off. New products are visible unless hidden.
  add column if not exists is_web_visible boolean not null default true,
  add column if not exists is_featured boolean not null default false,
  add column if not exists web_description text,
  -- Object key inside the product-images bucket (e.g. "eggs/ab12ef34.webp").
  -- Null = no image; the storefront falls back to an emoji.
  add column if not exists image_path text,
  -- Alt text for the cover image (a11y + SEO). Null = fall back to display_name.
  add column if not exists image_alt text;

-- Public bucket for product cover images. Public read (served over the Storage
-- CDN to the storefront); writes go through the service role only, so no
-- anonymous insert/update policy is created. Bucket-level limits (5 MB, image
-- mime types) back up the per-request validation in the upload server action.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
