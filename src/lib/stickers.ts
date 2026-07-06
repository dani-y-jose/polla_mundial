// Catálogo REAL del álbum Panini FIFA World Cup 2026™.
//
// Validado cruzando varias fuentes (julio 2026):
//   - Oficial Panini (paninigroup.com/en/wc26pack-contents): 980 figuritas =
//     48 selecciones × 20 (18 jugadores + 1 foto de equipo + 1 escudo) + 20
//     especiales "FWC"; formato de código "XXX N" con espacio (ej. "CAN 1").
//   - checklistinsider.com, diamondcardsonline.com y paniniwm2026sticker.com
//     coinciden EXACTO en los 48 códigos de 3 letras y en los grupos A–L (que
//     además calzan con TEAM_FLAGS del app).
//
// Lo que NO está en las fuentes accesibles (laststicker/scanini/beckett bloquean
// scraping): el NOMBRE de jugador por figurita. Por eso sólo etiquetamos el
// escudo (#1) y la foto de equipo (#13); el resto va con su código real y sin
// nombre. Si más adelante conseguimos el índice con nombres, se agregan como
// `label` sin cambiar los códigos.
//
// Orden = por grupo (A–L), como el álbum físico; las especiales van al final.
export type StickerCatalogItem = { code: string; label?: string };
export type AlbumTeamSection = { team: string; stickers: StickerCatalogItem[] };

// Selección (nombre tal como aparece en la app) → código Panini de 3 letras.
// En orden de grupo, igual que el álbum impreso.
const TEAM_CODE: [team: string, code: string][] = [
  // Grupo A
  ["México", "MEX"], ["Sudáfrica", "RSA"], ["Corea del Sur", "KOR"], ["Chequia", "CZE"],
  // Grupo B
  ["Canadá", "CAN"], ["Bosnia y Herzegovina", "BIH"], ["Catar", "QAT"], ["Suiza", "SUI"],
  // Grupo C
  ["Brasil", "BRA"], ["Marruecos", "MAR"], ["Haití", "HAI"], ["Escocia", "SCO"],
  // Grupo D
  ["Estados Unidos", "USA"], ["Paraguay", "PAR"], ["Australia", "AUS"], ["Turquía", "TUR"],
  // Grupo E
  ["Alemania", "GER"], ["Curazao", "CUW"], ["Ecuador", "ECU"], ["Costa de Marfil", "CIV"],
  // Grupo F
  ["Países Bajos", "NED"], ["Japón", "JPN"], ["Suecia", "SWE"], ["Túnez", "TUN"],
  // Grupo G
  ["Bélgica", "BEL"], ["Egipto", "EGY"], ["Irán", "IRN"], ["Nueva Zelanda", "NZL"],
  // Grupo H
  ["España", "ESP"], ["Cabo Verde", "CPV"], ["Arabia Saudita", "KSA"], ["Uruguay", "URU"],
  // Grupo I
  ["Francia", "FRA"], ["Senegal", "SEN"], ["Irak", "IRQ"], ["Noruega", "NOR"],
  // Grupo J
  ["Argentina", "ARG"], ["Argelia", "ALG"], ["Austria", "AUT"], ["Jordania", "JOR"],
  // Grupo K
  ["Portugal", "POR"], ["R.D. Congo", "COD"], ["Uzbekistán", "UZB"], ["Colombia", "COL"],
  // Grupo L
  ["Inglaterra", "ENG"], ["Croacia", "CRO"], ["Ghana", "GHA"], ["Panamá", "PAN"],
];

// 20 figuritas por equipo: #1 = escudo, #13 = foto del equipo, el resto jugadores.
const STICKERS_PER_TEAM = 20;
function teamStickers(code: string): StickerCatalogItem[] {
  return Array.from({ length: STICKERS_PER_TEAM }, (_, i) => {
    const n = i + 1;
    const label = n === 1 ? "Escudo" : n === 13 ? "Foto del equipo" : undefined;
    return { code: `${code} ${n}`, label };
  });
}

// Especiales (20 en total): la figurita "00" (portada/brillo, abre el álbum) +
// "FWC 1"–"FWC 19" (emblema, mascotas, balón, trofeo, sedes, historia/Museo FIFA).
// La "00" ES una de las 20 especiales (confirmado con el álbum físico).
const SPECIALS: StickerCatalogItem[] = [
  { code: "00", label: "Portada" },
  ...Array.from({ length: 19 }, (_, i) => ({ code: `FWC ${i + 1}` })),
];

// Página Coca-Cola — edición LATINOAMÉRICA (14 figuritas, CC1–CC14). NO salen en
// sobres: sólo en botellas de Coca-Cola / Coke Zero (bajo la etiqueta). Códigos y
// jugadores tomados del ÁLBUM FÍSICO del usuario (Bolivia) — online sólo estaba
// la versión de 12 de Norteamérica, que difiere. Código impreso "CCn" (sin espacio).
const COCA_COLA: StickerCatalogItem[] = [
  { code: "CC1", label: "Lamine Yamal (España)" },
  { code: "CC2", label: "Joshua Kimmich (Alemania)" },
  { code: "CC3", label: "Harry Kane (Inglaterra)" },
  { code: "CC4", label: "Santiago Giménez (México)" },
  { code: "CC5", label: "Joško Gvardiol (Croacia)" },
  { code: "CC6", label: "Federico Valverde (Uruguay)" },
  { code: "CC7", label: "Jefferson Lerma (Colombia)" },
  { code: "CC8", label: "Enner Valencia (Ecuador)" },
  { code: "CC9", label: "Gabriel Magalhães (Brasil)" },
  { code: "CC10", label: "Virgil van Dijk (Países Bajos)" },
  { code: "CC11", label: "Alphonso Davies (Canadá)" },
  { code: "CC12", label: "Emiliano Martínez (Argentina)" },
  { code: "CC13", label: "Raúl Jiménez (México)" },
  { code: "CC14", label: "Lautaro Martínez (Argentina)" },
];

export const ALBUM_SECTIONS: AlbumTeamSection[] = [
  ...TEAM_CODE.map(([team, code]) => ({ team, stickers: teamStickers(code) })),
  { team: "Especiales", stickers: SPECIALS },
  { team: "Coca-Cola", stickers: COCA_COLA },
];

// Total de figuritas a pegar (para el % de completado).
// = 48×20 (960) + 20 especiales (00 + FWC 1–19) + 14 Coca-Cola = 994.
export const ALBUM_TOTAL = ALBUM_SECTIONS.reduce((n, s) => n + s.stickers.length, 0);
