export const TEAM_FLAGS: Record<string, string> = {
  // Grupo A
  "México": "🇲🇽",
  "Sudáfrica": "🇿🇦",
  "Corea del Sur": "🇰🇷",
  "Chequia": "🇨🇿",
  // Grupo B
  "Canadá": "🇨🇦",
  "Bosnia y Herzegovina": "🇧🇦",
  "Catar": "🇶🇦",
  "Suiza": "🇨🇭",
  // Grupo C
  "Brasil": "🇧🇷",
  "Marruecos": "🇲🇦",
  "Haití": "🇭🇹",
  "Escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  // Grupo D
  "Estados Unidos": "🇺🇸",
  "Paraguay": "🇵🇾",
  "Australia": "🇦🇺",
  "Turquía": "🇹🇷",
  // Grupo E
  "Alemania": "🇩🇪",
  "Curazao": "🇨🇼",
  "Ecuador": "🇪🇨",
  "Costa de Marfil": "🇨🇮",
  // Grupo F
  "Países Bajos": "🇳🇱",
  "Japón": "🇯🇵",
  "Suecia": "🇸🇪",
  "Túnez": "🇹🇳",
  // Grupo G
  "Bélgica": "🇧🇪",
  "Egipto": "🇪🇬",
  "Irán": "🇮🇷",
  "Nueva Zelanda": "🇳🇿",
  // Grupo H
  "España": "🇪🇸",
  "Cabo Verde": "🇨🇻",
  "Arabia Saudita": "🇸🇦",
  "Uruguay": "🇺🇾",
  // Grupo I
  "Francia": "🇫🇷",
  "Senegal": "🇸🇳",
  "Irak": "🇮🇶",
  "Noruega": "🇳🇴",
  // Grupo J
  "Argentina": "🇦🇷",
  "Argelia": "🇩🇿",
  "Austria": "🇦🇹",
  "Jordania": "🇯🇴",
  // Grupo K
  "Portugal": "🇵🇹",
  "R.D. Congo": "🇨🇩",
  "Uzbekistán": "🇺🇿",
  "Colombia": "🇨🇴",
  // Grupo L
  "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Croacia": "🇭🇷",
  "Ghana": "🇬🇭",
  "Panamá": "🇵🇦",
};

export function getFlag(team: string): string {
  return TEAM_FLAGS[team] ?? "🏳️";
}

// The 48 teams competing in the tournament — the canonical roster, derived from
// TEAM_FLAGS so team pickers (e.g. the champion selector) never drift from the
// flag/match data. Sorted alphabetically (Spanish locale) for display.
export const WORLD_CUP_TEAMS = Object.keys(TEAM_FLAGS).sort((a, b) =>
  a.localeCompare(b, "es")
);
