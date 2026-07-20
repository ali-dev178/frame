import type { FormatTab, OptionDef, QualityDef, Target } from "../types";

export const FORMATS: FormatTab[] = [
  {tab:"post", label:"Post", targets:[
    {key:"post-1x1", label:"Square 1:1",      r:1,    suffix:"1x1",     dims:"1080 × 1080", hint:"Square feed post — equal bars on both sides."},
    {key:"post-4x5", label:"Portrait 4:5",    r:4/5,  suffix:"4x5",     dims:"1080 × 1350", hint:"Portrait feed post — the most feed space for tall photos."},
    {key:"post-191", label:"Landscape 1.91:1",r:1.91, suffix:"1.91x1",  dims:"1080 × 566",  hint:"Landscape feed post — wide, so tall photos get large side bars."}
  ]},
  {tab:"story", label:"Story", targets:[
    {key:"story", label:"Story 9:16", r:9/16, suffix:"story", dims:"1080 × 1920", hint:"Full-screen vertical Story."}
  ]},
  {tab:"reel", label:"Reel", targets:[
    {key:"reel",       label:"Reel 9:16",       r:9/16, suffix:"reel",       dims:"1080 × 1920", hint:"Full-screen vertical Reel."},
    {key:"reel-cover", label:"Reel cover 9:16", r:9/16, suffix:"reel-cover", dims:"1080 × 1920", hint:"Reel cover — the grid shows a centered crop, so keep key content in the middle."}
  ]},
  {tab:"profile", label:"Profile", targets:[
    {key:"profile", label:"Profile picture 1:1", r:1, suffix:"profile", dims:"320 × 320 min", hint:"Profile picture — shown as a circle, so keep key content centered."}
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
  {key:"none",      label:"Cut",          hint:"Hard cut — the only mode where Still frames stay 1:1 pixel copies end to end."},
  {key:"crossfade", label:"Crossfade",    hint:"Each clip dissolves smoothly into the next."},
  {key:"fadeblack", label:"Fade black",   hint:"Dips to black between clips — cinematic and forgiving."},
  {key:"slide",     label:"Slide",        hint:"The next clip slides in from the right."},
  {key:"wipe",      label:"Wipe",         hint:"The next clip is revealed left-to-right."}
];

export const TDURS: OptionDef[] = [
  {key:"0.3", label:"0.3s"},
  {key:"0.6", label:"0.6s"},
  {key:"1",   label:"1s"}
];
