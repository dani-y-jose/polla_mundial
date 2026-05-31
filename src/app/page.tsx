import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-blue-500/30 flex flex-col font-sans">
      <main className="flex-1 flex flex-col items-center justify-start relative overflow-hidden px-6 pt-[12vh] sm:pt-[14vh]">
        {/* Abstract Background Gradients */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/30 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute top-1/3 -right-20 w-96 h-96 bg-purple-600/30 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-emerald-600/30 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>

        {/* Mascot backdrop — anchored at the bottom of the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[50%] sm:h-[62%] bg-[url('/mascots.png')] bg-contain bg-bottom bg-no-repeat opacity-95"
        />
        {/* Seat the mascots' feet into the page and keep copy legible */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black via-black/50 to-black/85"
        />

        <div className="relative z-10 text-center max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-gray-300 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2"></span>
            Edición Copa Mundial 2026
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500">
            Apuesta. Compite. <br/> Gana la Gloria.
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link 
              href="/login" 
              className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 hover:scale-105 overflow-hidden"
            >
              <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-8 bg-white/20" />
              </div>
              <span className="relative">Comenzar</span>
              <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
