import { cn } from "@/components/ui";

// Iconos de navegación (trazo, currentColor) — estilo lineal coherente, sin
// librería externa. 24×24, hereda el color del texto del nav.
type IconProps = { className?: string };

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5", className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const HomeIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Icon>
);

export const PredictionsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);

export const TableIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 20h18" />
    <path d="M6 20v-7" />
    <path d="M12 20V5" />
    <path d="M18 20v-10" />
  </Icon>
);

export const GroupsIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const ProfileIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M19 21v-2a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

export const BellIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Icon>
);

// Álbum de figuritas: libro con lomo y ranuras.
export const AlbumIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 6 3Z" />
    <path d="M9.5 3v18" />
    <path d="M13 8.5h3" />
    <path d="M13 12h3" />
  </Icon>
);

export const ClockIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Icon>
);
