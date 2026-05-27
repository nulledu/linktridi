/** Formas orgânicas decorativas no fundo roxo — inspiradas no screenshot */
export default function PurpleShapes() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      viewBox="0 0 480 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* blobs/círculos principais */}
      <ellipse cx="420" cy="80" rx="90" ry="80" fill="#7c3aed" opacity="0.22" />
      <ellipse cx="60" cy="200" rx="70" ry="60" fill="#6d28d9" opacity="0.18" />
      <ellipse cx="430" cy="380" rx="60" ry="55" fill="#7c3aed" opacity="0.16" />
      <ellipse cx="50" cy="520" rx="80" ry="65" fill="#5b21b6" opacity="0.2" />
      <ellipse cx="400" cy="680" rx="75" ry="70" fill="#7c3aed" opacity="0.18" />
      <ellipse cx="80" cy="810" rx="60" ry="55" fill="#6d28d9" opacity="0.15" />

      {/* estrelas / sparkles */}
      {/* top-right cluster */}
      <path d="M390 30 L393 38 L401 38 L395 43 L397 51 L390 46 L383 51 L385 43 L379 38 L387 38 Z"
        fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.6" />
      <circle cx="415" cy="55" r="3" fill="#c4b5fd" opacity="0.5" />
      <circle cx="440" cy="40" r="2" fill="#a78bfa" opacity="0.5" />

      {/* left mid */}
      <path d="M30 330 L33 340 L43 340 L35 346 L38 356 L30 350 L22 356 L25 346 L17 340 L27 340 Z"
        fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.55" />
      <circle cx="15" cy="305" r="2.5" fill="#c4b5fd" opacity="0.5" />

      {/* right lower */}
      <path d="M455 480 L457 487 L464 487 L459 492 L461 499 L455 495 L449 499 L451 492 L446 487 L453 487 Z"
        fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.55" />
      <circle cx="470" cy="510" r="2" fill="#c4b5fd" opacity="0.45" />

      {/* bottom-left sparkle */}
      <path d="M25 720 L28 728 L36 728 L30 733 L32 741 L25 736 L18 741 L20 733 L14 728 L22 728 Z"
        fill="none" stroke="#a78bfa" strokeWidth="1.5" opacity="0.5" />

      {/* 4-point stars (small) */}
      <path d="M460 150 L462 155 L467 157 L462 159 L460 164 L458 159 L453 157 L458 155 Z"
        fill="#c4b5fd" opacity="0.55" />
      <path d="M20 440 L22 445 L27 447 L22 449 L20 454 L18 449 L13 447 L18 445 Z"
        fill="#c4b5fd" opacity="0.5" />
      <path d="M450 600 L452 605 L457 607 L452 609 L450 614 L448 609 L443 607 L448 605 Z"
        fill="#c4b5fd" opacity="0.5" />
      <path d="M30 860 L32 865 L37 867 L32 869 L30 874 L28 869 L23 867 L28 865 Z"
        fill="#c4b5fd" opacity="0.45" />

      {/* Círculos vazados (outlined) */}
      <circle cx="380" cy="160" r="18" fill="none" stroke="#9333ea" strokeWidth="2" opacity="0.35" />
      <circle cx="100" cy="100" r="12" fill="none" stroke="#a855f7" strokeWidth="1.5" opacity="0.35" />
      <circle cx="460" cy="290" r="14" fill="none" stroke="#9333ea" strokeWidth="2" opacity="0.3" />
      <circle cx="20" cy="640" r="16" fill="none" stroke="#a855f7" strokeWidth="1.5" opacity="0.3" />
      <circle cx="430" cy="820" r="20" fill="none" stroke="#9333ea" strokeWidth="2" opacity="0.3" />

      {/* Blobs irregulares */}
      <path d="M-10 140 Q20 110 50 130 Q80 150 70 180 Q60 210 30 200 Q-5 190 -10 140Z"
        fill="#6d28d9" opacity="0.25" />
      <path d="M440 280 Q475 260 490 300 Q505 340 470 350 Q435 360 430 325 Q425 290 440 280Z"
        fill="#7c3aed" opacity="0.2" />
      <path d="M-15 700 Q15 675 45 700 Q75 725 60 760 Q45 795 10 785 Q-25 775 -15 700Z"
        fill="#5b21b6" opacity="0.22" />
      <path d="M430 750 Q465 730 480 765 Q495 800 465 815 Q435 830 425 790 Q415 755 430 750Z"
        fill="#6d28d9" opacity="0.2" />

      {/* Dots decorativos */}
      {[60, 130, 200, 280, 360, 450, 540, 620, 700, 780, 850].map((y, i) => (
        <circle key={i} cx={i % 2 === 0 ? 468 : 12} cy={y} r="2.5" fill="#a78bfa" opacity="0.3" />
      ))}
    </svg>
  )
}
