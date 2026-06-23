import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "./ServiceWorkerRegistrar";
import { DialogProvider } from "@/components/DialogProvider";

// Display: Bricolage Grotesque (titulares, marcadores). Body: Hanken Grotesk.
// Ambas son variables, así next sirve el rango completo de pesos.
const fontDisplay = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const fontBody = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "⚽ Polla Mundial",
  description: "Predice los marcadores del Mundial 2026, compite con tus amigos y gana el pozo grupal.",
  applicationName: "Polla Mundial",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Polla Mundial",
  },
  icons: {
    icon: "/icon-192x192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#99fff8" },
    { media: "(prefers-color-scheme: dark)", color: "#002421" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fontDisplay.variable} ${fontBody.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Fondo de la app (estadio nocturno + velo del color plano). Capa fija
            detrás de todo; ver .app-backdrop en globals.css. */}
        <div className="app-backdrop" aria-hidden="true" />
        {/* Anti-flash: fija data-theme/color-scheme antes de hidratar (sin
            parpadeo). beforeInteractive evita el warning de <script> en el árbol. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var c=localStorage.getItem('theme')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=d?'dark':'light';var e=document.documentElement;e.dataset.theme=r;e.style.colorScheme=r;}catch(e){}})();`}
        </Script>
        <ServiceWorkerRegistrar />
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
