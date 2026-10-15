# Tarif görsellerinin üretim kaydı

2026-10-15 tarihinde yerleşik image_gen aracıyla, her tarif için ayrı bir çağrıda üretildi. CLI/API fallback kullanılmadı. Üçü de fotoğraf gerçekçiliğinde yapay zekâ görselidir; gerçek çiftlik çekimi değildir.

Teslim edilen görseller WebP biçiminde `public/tarifler/` altındadır. Dönüşüm yalnızca web için boyut ve dosya sıkıştırması uygular; kompozisyonu değiştirmez.

## koy-yumurtali-menemen

Dosya: `public/tarifler/koy-yumurtali-menemen.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: a freshly cooked Turkish köy yumurtalı menemen, two-person serving, in a small well-used dark iron frying pan.
Subject: three eggs gently scrambled and fully cooked through into a juicy mixture of finely grated ripe red tomatoes and sliced green peppers cooked in olive oil. The mixture has soft small yellow egg curds amid red tomato and green pepper pieces, moist but not watery. Lightly rustic and naturally imperfect. A small piece of crusty bread can sit at the edge of the composition.
Constraints: authentic scrambled menemen, no intact sunny-side eggs, no runny yolks, no cheese, no meat, no onion, no parsley garnish. Appetizing, realistic food, no oversized ingredients or artificial shine.
```

## firinda-yumurtali-patates

Dosya: `public/tarifler/firinda-yumurtali-patates.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: Turkish fırında yumurtalı patates, four-person serving in a shallow off-white ceramic baking dish.
Subject: golden roasted potato cubes about 2 cm across, gently browned edges, paprika and dried thyme, with exactly four whole baked eggs nestled in separate wells between potatoes. Egg whites fully set and opaque and yolks set, not runny. A small scattering of finely chopped fresh parsley as in the recipe.
Constraints: potatoes and eggs dominate, believable proportions. Exactly four eggs, no extra eggs, no cheese, no meat, no tomatoes, no peppers. Show the entire baking dish within the frame with a modest rim and natural home-cooked texture.
```

## ev-yapimi-yogurt

Dosya: `public/tarifler/ev-yapimi-yogurt.webp`

Son üretim prompt'u:

```text
Use case: photorealistic-natural.
Asset type: finished-dish photograph for a Turkish farm storefront recipe index and recipe detail page.
Style/medium: believable editorial food photography, natural edible textures, modest home cooking, warm soft window daylight from the left, matte pale stone tabletop with a subtle oatmeal linen napkin, gentle shadows, restrained earthy colors. Landscape 4:3 framing. One finished dish dominates the central 75 percent, with safe margins for responsive crops. Three-quarter view from about 45 degrees, food in clear focus, gently soft background. No people, no hands, no text, no lettering, no logos, no watermark, no collage, no packaging, no excessive props. A full-bleed photo only, not a webpage or poster.
Primary request: plain homemade Turkish yogurt made with fresh milk.
Subject: one simple handmade off-white ceramic bowl filled with thick plain ivory yogurt. A spoon gently resting in the bowl reveals the naturally set creamy texture with a soft scoop ridge, not whipped cream or ice cream. A small unbranded glass milk carafe in the soft background indicates fresh milk.
Constraints: plain unsweetened yogurt, no fruit, no berries, no honey, no granola, no mint, no other garnish. Natural subtle texture and slight sheen, not overly perfect swirls. Bowl is the clear focal point, the milk carafe stays secondary.
```

