// Server-only: image generation helpers shared by OG image and recap routes.
// Uses satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG).
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join } from "path";

let fontBold: ArrayBuffer | null = null;
let fontSemi: ArrayBuffer | null = null;

function loadFont(name: string): ArrayBuffer {
  const path = join(process.cwd(), "public", "fonts", name);
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function getBoldFont(): ArrayBuffer {
  if (!fontBold) fontBold = loadFont("space-grotesk-700.woff");
  return fontBold;
}

function getSemiFont(): ArrayBuffer {
  if (!fontSemi) fontSemi = loadFont("space-grotesk-600.woff");
  return fontSemi;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  return resvg.render().asPng();
}

export async function renderOgSvg(element: React.ReactElement): Promise<string> {
  return satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Space Grotesk", data: getBoldFont(), weight: 700, style: "normal" },
      { name: "Space Grotesk", data: getSemiFont(), weight: 600, style: "normal" },
    ],
  });
}

export async function renderRecapSvg(element: React.ReactElement): Promise<string> {
  return satori(element, {
    width: 1080,
    height: 1080,
    fonts: [
      { name: "Space Grotesk", data: getBoldFont(), weight: 700, style: "normal" },
      { name: "Space Grotesk", data: getSemiFont(), weight: 600, style: "normal" },
    ],
  });
}

export async function makeOgPng(element: React.ReactElement): Promise<Uint8Array> {
  const svg = await renderOgSvg(element);
  return svgToPng(svg);
}

export async function makeRecapPng(element: React.ReactElement): Promise<Uint8Array> {
  const svg = await renderRecapSvg(element);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1080 } });
  return resvg.render().asPng();
}

export const BRAND_BLUE = "#101327";
export const ACCENT = "#22c55e";
export const GOLD = "#f59e0b";
export const TEXT = "#f8fafc";
export const MUTED = "#94a3b8";
export const SURFACE = "#1e2840";
