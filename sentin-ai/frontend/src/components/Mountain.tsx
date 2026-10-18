/** Decorative layered mountain range used on the landing hero. Purely presentational. */
export function MountainArt() {
  return (
    <svg className="hero-art" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="peakA" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1e3a5f" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0b1426" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="peakB" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#23486f" stopOpacity="0.7" />
          <stop offset="1" stopColor="#0a1322" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="snow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.9" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill="url(#peakB)" d="M0,220 L140,120 L260,190 L420,60 L560,170 L700,90 L860,200 L1010,40 L1160,160 L1300,80 L1440,170 L1440,320 L0,320 Z" />
      <path fill="url(#snow)" d="M1010,40 L1060,110 L1030,100 L1000,120 L975,95 Z M420,60 L470,130 L440,122 L415,140 L392,110 Z" />
      <path fill="url(#peakA)" d="M0,280 L220,170 L380,240 L560,150 L760,260 L940,170 L1120,250 L1280,190 L1440,260 L1440,320 L0,320 Z" />
      <path fill="rgba(125,211,252,0.12)" d="M0,300 C240,260 480,320 720,290 C960,260 1200,310 1440,280 L1440,320 L0,320 Z" />
    </svg>
  );
}
