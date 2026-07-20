import type { FormatTab, OptionDef, QualityDef, Target } from "../types";

export const FORMATS: FormatTab[] = [
  {tab:"insta", label:"Instagram", targets:[
    {key:"ig-1x1",        label:"Post 1:1",      r:1,      suffix:"ig-1x1",        dims:"1080 × 1080", hint:"Square feed post — equal bars on both sides."},
    {key:"ig-4x5",        label:"Post 4:5",      r:4/5,    suffix:"ig-4x5",        dims:"1080 × 1350", hint:"Portrait feed post — the most feed space for tall photos."},
    {key:"ig-3x4",        label:"Post 3:4",      r:3/4,    suffix:"ig-3x4",        dims:"1080 × 1440", hint:"Portrait post — matches the profile grid's 3:4 preview."},
    {key:"ig-191",        label:"Post 1.91:1",   r:1.91,   suffix:"ig-1.91x1",     dims:"1080 × 566",  hint:"Landscape feed post — wide, so tall photos get large side bars."},
    {key:"ig-story",      label:"Story 9:16",    r:9/16,   suffix:"ig-story",      dims:"1080 × 1920", hint:"Full-screen vertical Story."},
    {key:"ig-reel",       label:"Reel 9:16",     r:9/16,   suffix:"ig-reel",       dims:"1080 × 1920", hint:"Full-screen vertical Reel."},
    {key:"ig-reel-cover", label:"Reel cover",    r:9/16,   suffix:"ig-reel-cover", dims:"1080 × 1920", hint:"Reel cover — the grid shows a centered crop, so keep key content in the middle."},
    {key:"ig-profile",    label:"Profile 1:1",   r:1,      suffix:"ig-profile",    dims:"320 × 320 min", hint:"Profile picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"tiktok", label:"TikTok", targets:[
    {key:"tiktok",         label:"Video 9:16",  r:9/16, suffix:"tiktok",         dims:"1080 × 1920", hint:"Full-screen vertical TikTok video."},
    {key:"tiktok-photo",   label:"Photo 3:4",   r:3/4,  suffix:"tiktok-3x4",     dims:"1080 × 1440", hint:"TikTok photo-mode post."},
    {key:"tiktok-profile", label:"Profile 1:1", r:1,    suffix:"tiktok-profile", dims:"200 × 200 min", hint:"Profile picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"yt", label:"YouTube", targets:[
    {key:"shorts",     label:"Shorts 9:16",    r:9/16,     suffix:"yt-shorts",  dims:"1080 × 1920", hint:"Full-screen vertical YouTube Short."},
    {key:"yt-video",   label:"Video 16:9",     r:16/9,     suffix:"yt-16x9",    dims:"1920 × 1080", hint:"Standard video frame — wide, so tall photos get large side bars."},
    {key:"yt-thumb",   label:"Thumbnail 16:9", r:16/9,     suffix:"yt-thumb",   dims:"1280 × 720",  hint:"Video thumbnail — it's small in feeds, so keep the subject big."},
    {key:"yt-banner",  label:"Banner 16:9",    r:16/9,     suffix:"yt-banner",  dims:"2560 × 1440", hint:"Channel banner — TVs show it all, phones crop hard, so keep key content centered."},
    {key:"yt-profile", label:"Profile 1:1",    r:1,        suffix:"yt-profile", dims:"800 × 800",   hint:"Channel picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"x", label:"X", targets:[
    {key:"x-169",     label:"Post 16:9",   r:16/9,    suffix:"x-16x9",   dims:"1200 × 675",  hint:"Landscape X post — the classic timeline crop."},
    {key:"x-1x1",     label:"Post 1:1",    r:1,       suffix:"x-1x1",    dims:"1080 × 1080", hint:"Square X post."},
    {key:"x-header",  label:"Header 3:1",  r:3,       suffix:"x-header", dims:"1500 × 500",  hint:"Profile header — very wide; the avatar overlaps the bottom-left corner."},
    {key:"x-profile", label:"Profile 1:1", r:1,       suffix:"x-profile", dims:"400 × 400",  hint:"Profile picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"fb", label:"Facebook", targets:[
    {key:"fb-191",     label:"Post 1.91:1", r:1.91,     suffix:"fb-1.91x1", dims:"1200 × 630",  hint:"Link-style landscape post."},
    {key:"fb-1x1",     label:"Post 1:1",    r:1,        suffix:"fb-1x1",    dims:"1080 × 1080", hint:"Square feed post."},
    {key:"fb-story",   label:"Story 9:16",  r:9/16,     suffix:"fb-story",  dims:"1080 × 1920", hint:"Full-screen vertical Story."},
    {key:"fb-cover",   label:"Cover 2.63:1",r:820/312,  suffix:"fb-cover",  dims:"820 × 312",   hint:"Page cover — phones crop the sides, so keep key content centered."},
    {key:"fb-profile", label:"Profile 1:1", r:1,        suffix:"fb-profile", dims:"170 × 170 min", hint:"Profile picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"li", label:"LinkedIn", targets:[
    {key:"li-191",     label:"Post 1.91:1", r:1200/627, suffix:"li-1.91x1", dims:"1200 × 627",  hint:"Link-style landscape post."},
    {key:"li-1x1",     label:"Post 1:1",    r:1,        suffix:"li-1x1",    dims:"1080 × 1080", hint:"Square feed post."},
    {key:"li-cover",   label:"Cover 4:1",   r:4,        suffix:"li-cover",  dims:"1584 × 396",  hint:"Profile banner — very wide; the avatar overlaps the bottom-left."},
    {key:"li-profile", label:"Profile 1:1", r:1,        suffix:"li-profile", dims:"400 × 400",  hint:"Profile picture — shown as a circle, so keep key content centered."}
  ]},
  {tab:"custom", label:"Custom", targets:[
    {key:"custom", label:"Custom", r:1, suffix:"custom", dims:"", hint:"Pick any canvas shape — width and height set the ratio."}
  ]}
];

export function tabDef(tk: string): FormatTab {
  for(let i=0;i<FORMATS.length;i++){ if(FORMATS[i].tab===tk) return FORMATS[i]; }
  return FORMATS[0];
}
export function targetDef(tk: string, key: string): Target {
  const d=tabDef(tk);
  for(let i=0;i<d.targets.length;i++){ if(d.targets[i].key===key) return d.targets[i]; }
  return d.targets[0];
}

export const MODES: OptionDef[] = [
  {key:"edges",    label:"Matched edges",  hint:"Extends each row's edge color outward — blends seamlessly."},
  {key:"stretch",  label:"Stretch",        hint:"Stretches the very edge pixels outward into soft streaks."},
  {key:"mirror",   label:"Mirror",         hint:"Reflects the photo's edge outward, so the scene appears to continue."},
  {key:"blur",     label:"Blurred photo",  hint:"Fills the space with a soft, blurred copy of the photo."},
  {key:"frosted",  label:"Frosted",        hint:"Blurred, lightened and desaturated for a soft, glassy look."},
  {key:"gradient", label:"Color gradient", hint:"A smooth gradient sampled from the edges of the photo."},
  {key:"duotone",  label:"Duotone",        hint:"A two-tone gradient built from the photo's dominant colors."},
  {key:"solid",    label:"Solid color",    hint:"A single flat color — auto from the photo, or pick your own."}
];
export const MKEYS = MODES.map(function(x){return x.key;});

export const MOTIONS: OptionDef[] = [
  {key:"static", label:"Still",    hint:"Sharp, static clips — the crispest option."},
  {key:"zoomin", label:"Zoom in",  hint:"A slow push in on each clip."},
  {key:"zoomout",label:"Zoom out", hint:"A slow pull back on each clip."},
  {key:"pan",    label:"Pan",      hint:"A gentle drift across each clip."}
];

export const VQUAL: QualityDef[] = [
  {key:"high",  label:"High",  v:12000000, a:256000},
  {key:"ultra", label:"Ultra", v:40000000, a:320000}
];

export const TRANSITIONS: OptionDef[] = [
  {key:"none",      label:"Cut",          hint:"Hard cut — with Still, Look: None, and no captions, frames stay 1:1 pixel copies."},
  {key:"crossfade", label:"Crossfade",    hint:"Each clip dissolves smoothly into the next."},
  {key:"fadeblack", label:"Fade black",   hint:"Dips to black between clips — cinematic and forgiving."},
  {key:"slide",     label:"Slide",        hint:"The next clip slides in from the right."},
  {key:"slideup",   label:"Slide up",     hint:"The next clip slides up from the bottom."},
  {key:"wipe",      label:"Wipe",         hint:"The next clip is revealed left-to-right."},
  {key:"iris",      label:"Iris",         hint:"The next clip opens from a circle in the center."}
];

export const LOOKS: OptionDef[] = [
  {key:"none",  label:"None",  hint:"Untouched color — with Still + Cut (and no captions) this is the pixel-perfect option."},
  {key:"warm",  label:"Warm",  hint:"A gentle golden-hour warmth."},
  {key:"cool",  label:"Cool",  hint:"A cooler, cleaner cast."},
  {key:"mono",  label:"Mono",  hint:"Black & white with a touch of contrast."},
  {key:"vivid", label:"Vivid", hint:"Richer color and a little extra punch."}
];

/** ctx.filter strings per look — "" means the untouched 1:1 path stays available. */
export const LOOK_FILTERS: Record<string, string> = {
  none: "",
  warm: "sepia(0.22) saturate(1.25) contrast(1.02)",
  cool: "hue-rotate(-10deg) saturate(1.08) brightness(1.02)",
  mono: "grayscale(1) contrast(1.05)",
  vivid: "saturate(1.35) contrast(1.06)",
};

export const TDURS: OptionDef[] = [
  {key:"0.3", label:"0.3s"},
  {key:"0.6", label:"0.6s"},
  {key:"1",   label:"1s"}
];
