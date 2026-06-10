// WC2026 group-stage schedule for the `matches:seed` command.
//
// Copied verbatim from the admin page's WC2026_GROUP_MATCHES
// (src/app/admin/page.tsx). The schedule is static; if it changes there,
// update it here too (or refactor both to import this module).
export interface SeedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffISO: string;
  city: string;
  stadiumName: string;
}

export const WC2026_GROUP_MATCHES: SeedMatch[] = [
  // Grupo A
  { id: "wc26_a_mexico_vs_sudafrica",           homeTeam: "México",                  awayTeam: "Sudáfrica",           kickoffISO: "2026-06-11T19:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_a_corea_vs_chequia",              homeTeam: "Corea del Sur",           awayTeam: "Chequia",             kickoffISO: "2026-06-12T02:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_a_chequia_vs_sudafrica",          homeTeam: "Chequia",                 awayTeam: "Sudáfrica",           kickoffISO: "2026-06-18T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_a_mexico_vs_corea",              homeTeam: "México",                  awayTeam: "Corea del Sur",       kickoffISO: "2026-06-19T01:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_a_chequia_vs_mexico",            homeTeam: "Chequia",                 awayTeam: "México",              kickoffISO: "2026-06-25T01:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_a_sudafrica_vs_corea",           homeTeam: "Sudáfrica",               awayTeam: "Corea del Sur",       kickoffISO: "2026-06-25T01:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  // Grupo B
  { id: "wc26_b_canada_vs_bosnia",             homeTeam: "Canadá",                  awayTeam: "Bosnia y Herzegovina",kickoffISO: "2026-06-12T19:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_b_catar_vs_suiza",               homeTeam: "Catar",                   awayTeam: "Suiza",               kickoffISO: "2026-06-13T19:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_b_suiza_vs_bosnia",              homeTeam: "Suiza",                   awayTeam: "Bosnia y Herzegovina",kickoffISO: "2026-06-18T19:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_b_canada_vs_catar",              homeTeam: "Canadá",                  awayTeam: "Catar",               kickoffISO: "2026-06-18T22:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_b_suiza_vs_canada",              homeTeam: "Suiza",                   awayTeam: "Canadá",              kickoffISO: "2026-06-24T19:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_b_bosnia_vs_catar",              homeTeam: "Bosnia y Herzegovina",    awayTeam: "Catar",               kickoffISO: "2026-06-24T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  // Grupo C
  { id: "wc26_c_brasil_vs_marruecos",          homeTeam: "Brasil",                  awayTeam: "Marruecos",           kickoffISO: "2026-06-13T22:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_c_haiti_vs_escocia",             homeTeam: "Haití",                   awayTeam: "Escocia",             kickoffISO: "2026-06-14T01:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_c_escocia_vs_marruecos",         homeTeam: "Escocia",                 awayTeam: "Marruecos",           kickoffISO: "2026-06-19T22:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_c_brasil_vs_haiti",              homeTeam: "Brasil",                  awayTeam: "Haití",               kickoffISO: "2026-06-20T00:30:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_c_escocia_vs_brasil",            homeTeam: "Escocia",                 awayTeam: "Brasil",              kickoffISO: "2026-06-24T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_c_marruecos_vs_haiti",           homeTeam: "Marruecos",               awayTeam: "Haití",               kickoffISO: "2026-06-24T22:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  // Grupo D
  { id: "wc26_d_eeuu_vs_paraguay",             homeTeam: "Estados Unidos",          awayTeam: "Paraguay",            kickoffISO: "2026-06-13T01:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_d_australia_vs_turquia",         homeTeam: "Australia",               awayTeam: "Turquía",             kickoffISO: "2026-06-14T04:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_d_eeuu_vs_australia",            homeTeam: "Estados Unidos",          awayTeam: "Australia",           kickoffISO: "2026-06-19T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_d_turquia_vs_paraguay",          homeTeam: "Turquía",                 awayTeam: "Paraguay",            kickoffISO: "2026-06-20T03:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_d_turquia_vs_eeuu",              homeTeam: "Turquía",                 awayTeam: "Estados Unidos",      kickoffISO: "2026-06-26T02:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_d_paraguay_vs_australia",        homeTeam: "Paraguay",                awayTeam: "Australia",           kickoffISO: "2026-06-26T02:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  // Grupo E
  { id: "wc26_e_alemania_vs_curazao",          homeTeam: "Alemania",                awayTeam: "Curazao",             kickoffISO: "2026-06-14T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_e_ecuador_vs_costademarfil",     homeTeam: "Ecuador",                 awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-14T23:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_e_alemania_vs_costademarfil",    homeTeam: "Alemania",                awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-20T20:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_e_ecuador_vs_curazao",           homeTeam: "Ecuador",                 awayTeam: "Curazao",             kickoffISO: "2026-06-21T00:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_e_curazao_vs_costademarfil",     homeTeam: "Curazao",                 awayTeam: "Costa de Marfil",     kickoffISO: "2026-06-25T20:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_e_ecuador_vs_alemania",          homeTeam: "Ecuador",                 awayTeam: "Alemania",            kickoffISO: "2026-06-25T20:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  // Grupo F
  { id: "wc26_f_paisesbajos_vs_japon",         homeTeam: "Países Bajos",            awayTeam: "Japón",               kickoffISO: "2026-06-14T20:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_f_suecia_vs_tunez",              homeTeam: "Suecia",                  awayTeam: "Túnez",               kickoffISO: "2026-06-15T02:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  { id: "wc26_f_paisesbajos_vs_suecia",        homeTeam: "Países Bajos",            awayTeam: "Suecia",              kickoffISO: "2026-06-20T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_f_tunez_vs_japon",               homeTeam: "Túnez",                   awayTeam: "Japón",               kickoffISO: "2026-06-21T04:00:00Z", city: "Monterrey",         stadiumName: "Estadio BBVA" },
  { id: "wc26_f_japon_vs_suecia",              homeTeam: "Japón",                   awayTeam: "Suecia",              kickoffISO: "2026-06-25T23:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_f_tunez_vs_paisesbajos",         homeTeam: "Túnez",                   awayTeam: "Países Bajos",        kickoffISO: "2026-06-25T23:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  // Grupo G
  { id: "wc26_g_belgica_vs_egipto",            homeTeam: "Bélgica",                 awayTeam: "Egipto",              kickoffISO: "2026-06-15T19:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_g_iran_vs_nuevazelanda",         homeTeam: "Irán",                    awayTeam: "Nueva Zelanda",       kickoffISO: "2026-06-16T01:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_g_belgica_vs_iran",              homeTeam: "Bélgica",                 awayTeam: "Irán",                kickoffISO: "2026-06-21T19:00:00Z", city: "Inglewood",         stadiumName: "SoFi Stadium" },
  { id: "wc26_g_nuevazelanda_vs_egipto",       homeTeam: "Nueva Zelanda",           awayTeam: "Egipto",              kickoffISO: "2026-06-22T01:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  { id: "wc26_g_egipto_vs_iran",               homeTeam: "Egipto",                  awayTeam: "Irán",                kickoffISO: "2026-06-27T03:00:00Z", city: "Seattle",           stadiumName: "Lumen Field" },
  { id: "wc26_g_nuevazelanda_vs_belgica",      homeTeam: "Nueva Zelanda",           awayTeam: "Bélgica",             kickoffISO: "2026-06-27T03:00:00Z", city: "Vancouver",         stadiumName: "BC Place" },
  // Grupo H
  { id: "wc26_h_espana_vs_caboverde",          homeTeam: "España",                  awayTeam: "Cabo Verde",          kickoffISO: "2026-06-15T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_h_arabiasaudita_vs_uruguay",     homeTeam: "Arabia Saudita",          awayTeam: "Uruguay",             kickoffISO: "2026-06-15T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_h_espana_vs_arabiasaudita",      homeTeam: "España",                  awayTeam: "Arabia Saudita",      kickoffISO: "2026-06-21T16:00:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  { id: "wc26_h_uruguay_vs_caboverde",         homeTeam: "Uruguay",                 awayTeam: "Cabo Verde",          kickoffISO: "2026-06-21T22:00:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_h_caboverde_vs_arabiasaudita",   homeTeam: "Cabo Verde",              awayTeam: "Arabia Saudita",      kickoffISO: "2026-06-27T00:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_h_uruguay_vs_espana",            homeTeam: "Uruguay",                 awayTeam: "España",              kickoffISO: "2026-06-27T00:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  // Grupo I
  { id: "wc26_i_francia_vs_senegal",           homeTeam: "Francia",                 awayTeam: "Senegal",             kickoffISO: "2026-06-16T19:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_i_irak_vs_noruega",              homeTeam: "Irak",                    awayTeam: "Noruega",             kickoffISO: "2026-06-16T22:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_i_francia_vs_irak",              homeTeam: "Francia",                 awayTeam: "Irak",                kickoffISO: "2026-06-22T21:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
  { id: "wc26_i_noruega_vs_senegal",           homeTeam: "Noruega",                 awayTeam: "Senegal",             kickoffISO: "2026-06-23T00:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_i_noruega_vs_francia",           homeTeam: "Noruega",                 awayTeam: "Francia",             kickoffISO: "2026-06-26T19:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_i_senegal_vs_irak",              homeTeam: "Senegal",                 awayTeam: "Irak",                kickoffISO: "2026-06-26T19:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  // Grupo J
  { id: "wc26_j_argentina_vs_argelia",         homeTeam: "Argentina",               awayTeam: "Argelia",             kickoffISO: "2026-06-17T01:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  { id: "wc26_j_austria_vs_jordania",          homeTeam: "Austria",                 awayTeam: "Jordania",            kickoffISO: "2026-06-17T04:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_j_argentina_vs_austria",         homeTeam: "Argentina",               awayTeam: "Austria",             kickoffISO: "2026-06-22T17:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_j_jordania_vs_argelia",          homeTeam: "Jordania",                awayTeam: "Argelia",             kickoffISO: "2026-06-23T03:00:00Z", city: "Santa Clara",       stadiumName: "Levi's Stadium" },
  { id: "wc26_j_jordania_vs_argentina",        homeTeam: "Jordania",                awayTeam: "Argentina",           kickoffISO: "2026-06-28T02:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_j_argelia_vs_austria",           homeTeam: "Argelia",                 awayTeam: "Austria",             kickoffISO: "2026-06-28T02:00:00Z", city: "Kansas City",       stadiumName: "Arrowhead Stadium" },
  // Grupo K
  { id: "wc26_k_portugal_vs_rdcongo",          homeTeam: "Portugal",                awayTeam: "R.D. Congo",          kickoffISO: "2026-06-17T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_k_uzbekistan_vs_colombia",       homeTeam: "Uzbekistán",              awayTeam: "Colombia",            kickoffISO: "2026-06-18T02:00:00Z", city: "Ciudad de México",  stadiumName: "Estadio Azteca" },
  { id: "wc26_k_portugal_vs_uzbekistan",       homeTeam: "Portugal",                awayTeam: "Uzbekistán",          kickoffISO: "2026-06-23T17:00:00Z", city: "Houston",           stadiumName: "NRG Stadium" },
  { id: "wc26_k_colombia_vs_rdcongo",          homeTeam: "Colombia",                awayTeam: "R.D. Congo",          kickoffISO: "2026-06-24T02:00:00Z", city: "Guadalajara",       stadiumName: "Estadio Akron" },
  { id: "wc26_k_colombia_vs_portugal",         homeTeam: "Colombia",                awayTeam: "Portugal",            kickoffISO: "2026-06-27T23:30:00Z", city: "Miami",             stadiumName: "Hard Rock Stadium" },
  { id: "wc26_k_rdcongo_vs_uzbekistan",        homeTeam: "R.D. Congo",              awayTeam: "Uzbekistán",          kickoffISO: "2026-06-27T23:30:00Z", city: "Atlanta",           stadiumName: "Mercedes-Benz Stadium" },
  // Grupo L
  { id: "wc26_l_inglaterra_vs_croacia",        homeTeam: "Inglaterra",              awayTeam: "Croacia",             kickoffISO: "2026-06-17T20:00:00Z", city: "Arlington",         stadiumName: "AT&T Stadium" },
  { id: "wc26_l_ghana_vs_panama",              homeTeam: "Ghana",                   awayTeam: "Panamá",              kickoffISO: "2026-06-17T23:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_l_inglaterra_vs_ghana",          homeTeam: "Inglaterra",              awayTeam: "Ghana",               kickoffISO: "2026-06-23T20:00:00Z", city: "Foxborough",        stadiumName: "Gillette Stadium" },
  { id: "wc26_l_panama_vs_croacia",            homeTeam: "Panamá",                  awayTeam: "Croacia",             kickoffISO: "2026-06-23T23:00:00Z", city: "Toronto",           stadiumName: "BMO Field" },
  { id: "wc26_l_inglaterra_vs_panama",         homeTeam: "Inglaterra",              awayTeam: "Panamá",              kickoffISO: "2026-06-27T21:00:00Z", city: "East Rutherford",   stadiumName: "MetLife Stadium" },
  { id: "wc26_l_croacia_vs_ghana",             homeTeam: "Croacia",                 awayTeam: "Ghana",               kickoffISO: "2026-06-27T21:00:00Z", city: "Philadelphia",      stadiumName: "Lincoln Financial Field" },
];
