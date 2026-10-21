/**
 * Public introductory media for the landing page.
 *
 * The supplied public Home showcase clip is bundled locally. A deployment
 * setting may replace it, and an explicit null can still render the artwork
 * placeholder. This is separate from private room-specific evacuation guides.
 */
export interface HomeShowcaseCaptionTrack {
  url: string;
  language: string;
  label: string;
}

export interface HomeShowcaseMediaConfig {
  videoUrl?: string | null;
  posterUrl?: string | null;
  captions?: HomeShowcaseCaptionTrack | null;
}

function optionalPublicUrl(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

const captionsUrl = optionalPublicUrl(import.meta.env.VITE_HOME_SHOWCASE_CAPTIONS_URL);
const videoUrl = optionalPublicUrl(import.meta.env.VITE_HOME_SHOWCASE_VIDEO_URL)
  ?? "/videos/plv-navisync-showcase.mp4";

export const HOME_SHOWCASE_MEDIA: HomeShowcaseMediaConfig = Object.freeze({
  videoUrl,
  posterUrl: optionalPublicUrl(import.meta.env.VITE_HOME_SHOWCASE_POSTER_URL),
  captions: captionsUrl ? {
    url: captionsUrl,
    language: optionalPublicUrl(import.meta.env.VITE_HOME_SHOWCASE_CAPTIONS_LANGUAGE) ?? "en",
    label: optionalPublicUrl(import.meta.env.VITE_HOME_SHOWCASE_CAPTIONS_LABEL) ?? "Captions",
  } : null,
});
