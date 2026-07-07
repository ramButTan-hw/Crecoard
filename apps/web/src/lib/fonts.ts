export type FontCategory = "Sans" | "Serif" | "Display" | "Handwriting" | "Mono";

export interface FontDef {
  name: string;
  category: FontCategory;
}

export const GOOGLE_FONTS: FontDef[] = [
  // Sans-serif
  { name: "Roboto",            category: "Sans" },
  { name: "Open Sans",         category: "Sans" },
  { name: "Lato",              category: "Sans" },
  { name: "Nunito",            category: "Sans" },
  { name: "Poppins",           category: "Sans" },
  { name: "Raleway",           category: "Sans" },
  { name: "Montserrat",        category: "Sans" },
  { name: "Outfit",            category: "Sans" },
  { name: "DM Sans",           category: "Sans" },
  { name: "Plus Jakarta Sans", category: "Sans" },
  { name: "Figtree",           category: "Sans" },
  { name: "Josefin Sans",      category: "Sans" },
  { name: "Quicksand",         category: "Sans" },
  { name: "Nunito Sans",       category: "Sans" },
  { name: "Barlow",            category: "Sans" },
  { name: "Work Sans",         category: "Sans" },

  // Serif
  { name: "Playfair Display",    category: "Serif" },
  { name: "Merriweather",        category: "Serif" },
  { name: "Lora",                category: "Serif" },
  { name: "EB Garamond",         category: "Serif" },
  { name: "Cormorant Garamond",  category: "Serif" },
  { name: "Libre Baskerville",   category: "Serif" },
  { name: "PT Serif",            category: "Serif" },
  { name: "Crimson Text",        category: "Serif" },
  { name: "Spectral",            category: "Serif" },
  { name: "Bitter",              category: "Serif" },
  { name: "Zilla Slab",          category: "Serif" },

  // Display
  { name: "Bebas Neue",       category: "Display" },
  { name: "Anton",            category: "Display" },
  { name: "Righteous",        category: "Display" },
  { name: "Abril Fatface",    category: "Display" },
  { name: "Titan One",        category: "Display" },
  { name: "Boogaloo",         category: "Display" },
  { name: "Fredoka One",      category: "Display" },
  { name: "Lilita One",       category: "Display" },
  { name: "Press Start 2P",   category: "Display" },
  { name: "Alfa Slab One",    category: "Display" },
  { name: "Black Han Sans",   category: "Display" },
  { name: "Exo 2",            category: "Display" },
  { name: "Orbitron",         category: "Display" },

  // Handwriting
  { name: "Pacifico",          category: "Handwriting" },
  { name: "Dancing Script",    category: "Handwriting" },
  { name: "Caveat",            category: "Handwriting" },
  { name: "Indie Flower",      category: "Handwriting" },
  { name: "Patrick Hand",      category: "Handwriting" },
  { name: "Shadows Into Light",category: "Handwriting" },
  { name: "Permanent Marker",  category: "Handwriting" },
  { name: "Kalam",             category: "Handwriting" },
  { name: "Satisfy",           category: "Handwriting" },
  { name: "Lobster",           category: "Handwriting" },
  { name: "Great Vibes",       category: "Handwriting" },
  { name: "Cookie",            category: "Handwriting" },

  // Monospace
  { name: "Fira Code",       category: "Mono" },
  { name: "JetBrains Mono",  category: "Mono" },
  { name: "Source Code Pro", category: "Mono" },
  { name: "Space Mono",      category: "Mono" },
  { name: "IBM Plex Mono",   category: "Mono" },
  { name: "Courier Prime",   category: "Mono" },
  { name: "Roboto Mono",     category: "Mono" },
  { name: "Share Tech Mono", category: "Mono" },
];

const loaded = new Set<string>();

export function loadGoogleFont(family: string) {
  if (loaded.has(family) || typeof document === "undefined") return;
  const id = `gfont-${family.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
  loaded.add(family);
}

export async function loadUserFont(name: string, dataUrl: string): Promise<void> {
  if (loaded.has(name) || typeof document === "undefined") return;
  try {
    const font = new FontFace(name, `url(${dataUrl})`);
    await font.load();
    document.fonts.add(font);
    loaded.add(name);
  } catch {
    // silently ignore bad font files
  }
}
