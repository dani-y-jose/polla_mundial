// Grupo activo persistido entre rutas (el dashboard y /grupos comparten cuál es
// el grupo "activo"). Sólo cliente; tolera localStorage no disponible.
const KEY = "polla.activeGroup";

export function getActiveGroupId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveGroupId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* no-op */
  }
}
