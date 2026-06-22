declare module "react-world-flags" {
  import * as React from "react";

  export interface FlagProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    /** ISO 3166-1 alpha-2 / alpha-3 / numeric, o subdivisión GB (p. ej. "GB-ENG"). */
    code?: string;
    /** Render alternativo cuando el código no existe. */
    fallback?: React.ReactNode;
  }

  const Flag: React.FC<FlagProps>;
  export default Flag;
}
