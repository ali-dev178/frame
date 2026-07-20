/** An [r, g, b] color, 0–255 floats (averaged, not rounded until rendered). */
export type RGB = number[];

export interface Target {
  key: string;
  label: string;
  /** Aspect ratio as width / height. */
  r: number;
  /** Filename suffix for downloads (e.g. "4x5"). */
  suffix: string;
  /** Instagram's nominal pixel size, display only. */
  dims: string;
  hint: string;
}

export interface FormatTab {
  tab: string;
  label: string;
  targets: Target[];
}

export interface OptionDef {
  key: string;
  label: string;
  hint?: string;
}

export interface QualityDef {
  key: string;
  label: string;
  /** Video bitrate, bits/s. */
  v: number;
  /** Audio bitrate, bits/s. */
  a: number;
}

export interface Settings {
  tab: string;
  targetByTab: Record<string, string>;
  mode: string;
  blur: number;
  dark: number;
  bounds: boolean;
  solidMode: "auto" | "custom";
  solidColor: string;
  /** Custom-tab canvas size — only the ratio matters for framing. */
  customW: number;
  customH: number;
  motion: string;
  vq: string;
  vfade: boolean;
  trans: string;
  transDur: number;
  /** Video color look (ctx.filter) — "none" keeps Still+Cut frames 1:1. */
  look: string;
}

/** Per-row / per-column averaged edge colors of a photo. */
export interface EdgeColors {
  left: RGB[];
  right: RGB[];
  top: RGB[];
  bottom: RGB[];
}

/** Corner-averaged colors for the gradient fill. */
export interface GradColors {
  leftTop: RGB;
  leftBot: RGB;
  rightTop: RGB;
  rightBot: RGB;
  topStart: RGB;
  topEnd: RGB;
  botStart: RGB;
  botEnd: RGB;
}

/** A loaded photo and everything derived from it. */
export interface Item {
  id: number;
  name: string;
  file: File;
  img: HTMLImageElement;
  iw: number;
  ih: number;
  edges: EdgeColors | null;
  grad: GradColors | null;
  /** Overall average color (for the Auto solid fill). */
  avg?: RGB | null;
  /** Two dominant tones (for the Duotone fill). */
  duo?: { dark: RGB; light: RGB } | null;
  /** The framed output canvas — rendered per current settings. */
  canvas: HTMLCanvasElement | null;
  /** The photo card element in the grid. */
  el: HTMLElement | null;
  /** True when the photo already matches the target ratio (download = original file). */
  passthrough?: boolean;
  /** Where the original sits inside the framed canvas. */
  geo?: { dx: number; dy: number } | null;
  thumbUrl?: string | null;
  selected?: boolean;
}

/** One entry in the video timeline. */
export interface Clip {
  id: number;
  /** Seconds this clip shows. */
  dur: number;
  /** Caption drawn over this clip's frames. */
  text?: string;
}

/** One audio block on the timeline. */
export interface AudioTrack {
  id: number;
  name: string;
  /** The original encoded file — kept so projects can be saved/restored. */
  file?: Blob;
  buffer: AudioBuffer;
  /** Full decoded duration, seconds. */
  dur: number;
  /** Trim-in point within the buffer, seconds. */
  start: number;
  /** Trim-out point within the buffer, seconds. */
  end: number;
  /** Position on the video timeline, seconds. */
  at: number;
  /** Which visual row the block sits on. */
  lane: number;
}

export type Orient = "sides" | "vert" | "none";

export interface LayoutResult {
  cw: number;
  ch: number;
  dx: number;
  dy: number;
  orient: Orient;
}

/** Full geometry handed to the fill painters. */
export interface Geometry {
  cw: number;
  ch: number;
  dx: number;
  dy: number;
  orient: Orient;
  leftPad: number;
  rightPad: number;
  topPad: number;
  botPad: number;
  iw: number;
  ih: number;
}

export interface BuiltFrame {
  cv: HTMLCanvasElement;
  cw: number;
  ch: number;
  dx: number;
  dy: number;
  iw: number;
  ih: number;
}

/** MediaRecorder fallback format candidate. */
export interface RecFormat {
  m: string;
  ext: string;
  label: string;
  ig: boolean;
}

/** Offline-rendered stereo mixdown for the fast exporter. */
export interface AudioPlan {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}
