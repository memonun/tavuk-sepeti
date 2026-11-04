"use client";

/**
 * The home page text, edited in /vitrin next to the photos it sits on: the
 * slogan above the showcase and the sentence on its photos.
 */
import { useActionState, useState } from "react";

import { updateHeroTextAction } from "@/features/storefront/application/update-hero-text";
import type { UpdateStorefrontSettingsState } from "@/features/storefront/application/update-storefront-settings";
import {
  MAX_HERO_SUBTITLE_LENGTH,
  MAX_HERO_TITLE_LENGTH,
} from "@/features/storefront/domain/storefront-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: UpdateStorefrontSettingsState = { status: "idle" };

export function HeroTextForm({
  heroTitle,
  heroSubtitle,
}: {
  heroTitle: string;
  heroSubtitle: string;
}) {
  const [state, formAction, pending] = useActionState(updateHeroTextAction, initialState);
  const [title, setTitle] = useState(heroTitle);
  const [subtitle, setSubtitle] = useState(heroSubtitle);
  const titleValid = title.trim().length > 0 && title.trim().length <= MAX_HERO_TITLE_LENGTH;
  const subtitleValid =
    subtitle.trim().length > 0 && subtitle.trim().length <= MAX_HERO_SUBTITLE_LENGTH;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-title">Slogan</Label>
        <Input
          id="hero-title"
          name="hero_title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={MAX_HERO_TITLE_LENGTH}
          disabled={pending}
          aria-invalid={!titleValid || undefined}
        />
        <p className="text-xs text-muted-foreground">
          {titleValid
            ? `Vitrinin üstündeki başlık. ${title.trim().length}/${MAX_HERO_TITLE_LENGTH} karakter.`
            : "Slogan boş olamaz."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hero-subtitle">Vitrin açıklaması</Label>
        <Textarea
          id="hero-subtitle"
          name="hero_subtitle"
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          maxLength={MAX_HERO_SUBTITLE_LENGTH}
          rows={3}
          disabled={pending}
          aria-invalid={!subtitleValid || undefined}
        />
        <p className="text-xs text-muted-foreground">
          {subtitleValid
            ? `Fotoğrafların üstünde durur, telefonda da görünür; kısa tutmak fotoğrafı açık bırakır. ${subtitle.trim().length}/${MAX_HERO_SUBTITLE_LENGTH} karakter.`
            : "Vitrin açıklaması boş olamaz."}
        </p>
      </div>

      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-primary" role="status">
          Metin kaydedildi.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || !titleValid || !subtitleValid}>
          {pending ? "Kaydediliyor…" : "Metni kaydet"}
        </Button>
      </div>
    </form>
  );
}
