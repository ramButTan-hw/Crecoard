export interface AppEffect {
  id: string;
  label: string;
  description: string;
  bgFilter: string;
  overlay: string;
  previewGradient: string;
}

export const APP_EFFECTS: AppEffect[] = [
  {
    id: "none",
    label: "None",
    description: "Standard solid backgrounds",
    bgFilter: "",
    overlay: "transparent",
    previewGradient: "linear-gradient(135deg, #25262b, #1a1b1e)",
  },
  {
    id: "glossy",
    label: "Glossy",
    description: "Bright glass with soft blur",
    bgFilter: "blur(80px) brightness(1.2) saturate(1.4)",
    overlay: "rgba(255,255,255,0.04)",
    previewGradient: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(180,200,255,0.08) 100%)",
  },
  {
    id: "dark-stained",
    label: "Dark Stained",
    description: "Deep shadows, color hints",
    bgFilter: "blur(60px) brightness(0.3) saturate(0.6)",
    overlay: "rgba(0,0,0,0.6)",
    previewGradient: "linear-gradient(135deg, rgba(5,5,10,0.95), rgba(20,15,30,0.8))",
  },
  {
    id: "vintage",
    label: "Vintage",
    description: "Warm sepia nostalgia",
    bgFilter: "blur(80px) sepia(1) brightness(0.65) saturate(0.7)",
    overlay: "rgba(80,40,0,0.3)",
    previewGradient: "linear-gradient(135deg, rgba(100,60,20,0.7), rgba(60,35,5,0.5))",
  },
  {
    id: "frosted",
    label: "Frosted",
    description: "Heavy white-blue glass",
    bgFilter: "blur(120px) brightness(1.1) saturate(0.35)",
    overlay: "rgba(200,215,255,0.07)",
    previewGradient: "linear-gradient(135deg, rgba(190,205,255,0.25), rgba(160,180,240,0.12))",
  },
  {
    id: "neon",
    label: "Neon",
    description: "Vivid saturated glow",
    bgFilter: "blur(60px) brightness(0.5) saturate(5)",
    overlay: "rgba(0,0,30,0.55)",
    previewGradient: "linear-gradient(135deg, rgba(88,101,242,0.5), rgba(0,220,160,0.35))",
  },
  {
    id: "matte",
    label: "Matte",
    description: "Subtle color, minimal blur",
    bgFilter: "blur(30px) brightness(0.35) saturate(0.65)",
    overlay: "rgba(12,12,18,0.82)",
    previewGradient: "linear-gradient(135deg, rgba(18,18,28,0.95), rgba(28,28,40,0.8))",
  },
  {
    id: "sunrise",
    label: "Sunrise",
    description: "Warm golden-hour light",
    bgFilter: "blur(80px) brightness(0.75) saturate(1.3) hue-rotate(-15deg)",
    overlay: "rgba(255,110,0,0.14)",
    previewGradient: "linear-gradient(135deg, rgba(255,140,0,0.45), rgba(200,50,0,0.25))",
  },
];

export function getEffect(id: string): AppEffect {
  return APP_EFFECTS.find((e) => e.id === id) ?? APP_EFFECTS[1]!;
}
