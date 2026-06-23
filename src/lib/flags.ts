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

// Team → ISO 3166-1 alpha-2 (o subdivisión GB) para react-world-flags (banderas
// SVG). Inglaterra/Escocia usan las subdivisiones GB-ENG / GB-SCT.
export const TEAM_CODES: Record<string, string> = {
  "México": "MX", "Sudáfrica": "ZA", "Corea del Sur": "KR", "Chequia": "CZ",
  "Canadá": "CA", "Bosnia y Herzegovina": "BA", "Catar": "QA", "Suiza": "CH",
  "Brasil": "BR", "Marruecos": "MA", "Haití": "HT", "Escocia": "GB-SCT",
  "Estados Unidos": "US", "Paraguay": "PY", "Australia": "AU", "Turquía": "TR",
  "Alemania": "DE", "Curazao": "CW", "Ecuador": "EC", "Costa de Marfil": "CI",
  "Países Bajos": "NL", "Japón": "JP", "Suecia": "SE", "Túnez": "TN",
  "Bélgica": "BE", "Egipto": "EG", "Irán": "IR", "Nueva Zelanda": "NZ",
  "España": "ES", "Cabo Verde": "CV", "Arabia Saudita": "SA", "Uruguay": "UY",
  "Francia": "FR", "Senegal": "SN", "Irak": "IQ", "Noruega": "NO",
  "Argentina": "AR", "Argelia": "DZ", "Austria": "AT", "Jordania": "JO",
  "Portugal": "PT", "R.D. Congo": "CD", "Uzbekistán": "UZ", "Colombia": "CO",
  "Inglaterra": "GB-ENG", "Croacia": "HR", "Ghana": "GH", "Panamá": "PA",
};

// ISO code para react-world-flags; undefined para equipos sin país (placeholders).
export function getFlagCode(team: string): string | undefined {
  return TEAM_CODES[team];
}
