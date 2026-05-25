/* Heredita — countryball avatar engine
 * - defines flags (as inner SVG markup, drawn inside a 100x60 viewBox)
 * - composes a full countryball SVG (sphere + clipped flag + accessories)
 * - persists avatar in localStorage under 'heredita.avatar'
 * - mounts customizer on the #avatarRoot element if present
 * - injects mini avatar into every .user-chip .avatar across the site
 */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORAGE_KEY = 'heredita.avatar';

  // ============================================================
  // FLAGS — each is the inner SVG markup of a 100x60 viewBox flag.
  // They're drawn inside a clipped circle so simple geometry is fine.
  // ============================================================
  const FLAGS = {
    // ---------- MODERN ----------
    usa: {
      name: 'USA',
      svg: `
        <rect width="100" height="60" fill="#b22234"/>
        <g fill="#fff">
          <rect y="4.6"  width="100" height="4.6"/>
          <rect y="13.8" width="100" height="4.6"/>
          <rect y="23"   width="100" height="4.6"/>
          <rect y="32.3" width="100" height="4.6"/>
          <rect y="41.5" width="100" height="4.6"/>
          <rect y="50.8" width="100" height="4.6"/>
        </g>
        <rect width="40" height="32.3" fill="#3c3b6e"/>
      `
    },
    uk: {
      name: 'United Kingdom',
      svg: `
        <rect width="100" height="60" fill="#012169"/>
        <path d="M0,0 L100,60 M100,0 L0,60" stroke="#fff" stroke-width="10"/>
        <path d="M0,0 L100,60 M100,0 L0,60" stroke="#C8102E" stroke-width="4"/>
        <path d="M50,0 V60 M0,30 H100" stroke="#fff" stroke-width="16"/>
        <path d="M50,0 V60 M0,30 H100" stroke="#C8102E" stroke-width="8"/>
      `
    },
    france: {
      name: 'France',
      svg: `<rect width="33.33" height="60" fill="#0055A4"/><rect x="33.33" width="33.33" height="60" fill="#fff"/><rect x="66.66" width="33.34" height="60" fill="#EF4135"/>`
    },
    germany: {
      name: 'Germany',
      svg: `<rect width="100" height="20" fill="#000"/><rect y="20" width="100" height="20" fill="#DD0000"/><rect y="40" width="100" height="20" fill="#FFCE00"/>`
    },
    italy: {
      name: 'Italy',
      svg: `<rect width="33.33" height="60" fill="#009246"/><rect x="33.33" width="33.33" height="60" fill="#fff"/><rect x="66.66" width="33.34" height="60" fill="#CE2B37"/>`
    },
    spain: {
      name: 'Spain',
      svg: `<rect width="100" height="60" fill="#AA151B"/><rect y="15" width="100" height="30" fill="#F1BF00"/>`
    },
    poland: {
      name: 'Poland',
      svg: `<rect width="100" height="30" fill="#fff"/><rect y="30" width="100" height="30" fill="#DC143C"/>`
    },
    russia: {
      name: 'Russia',
      svg: `<rect width="100" height="20" fill="#fff"/><rect y="20" width="100" height="20" fill="#0039A6"/><rect y="40" width="100" height="20" fill="#D52B1E"/>`
    },
    ukraine: {
      name: 'Ukraine',
      svg: `<rect width="100" height="30" fill="#0057B7"/><rect y="30" width="100" height="30" fill="#FFD700"/>`
    },
    japan: {
      name: 'Japan',
      svg: `<rect width="100" height="60" fill="#fff"/><circle cx="50" cy="30" r="18" fill="#BC002D"/>`
    },
    china: {
      name: 'China',
      svg: `<rect width="100" height="60" fill="#DE2910"/><circle cx="20" cy="20" r="8" fill="#FFDE00"/><circle cx="33" cy="10" r="3" fill="#FFDE00"/><circle cx="40" cy="20" r="3" fill="#FFDE00"/><circle cx="40" cy="32" r="3" fill="#FFDE00"/><circle cx="33" cy="40" r="3" fill="#FFDE00"/>`
    },
    skorea: {
      name: 'South Korea',
      svg: `<rect width="100" height="60" fill="#fff"/><circle cx="50" cy="30" r="12" fill="#CD2E3A"/><path d="M38,30 a12,12 0 0 1 24,0 a6,6 0 0 1 -12,0 a6,6 0 0 0 -12,0" fill="#0047A0"/>`
    },
    india: {
      name: 'India',
      svg: `<rect width="100" height="20" fill="#FF9933"/><rect y="20" width="100" height="20" fill="#fff"/><rect y="40" width="100" height="20" fill="#138808"/><circle cx="50" cy="30" r="6" fill="none" stroke="#000080" stroke-width="1.5"/>`
    },
    brazil: {
      name: 'Brazil',
      svg: `<rect width="100" height="60" fill="#009C3B"/><polygon points="50,6 92,30 50,54 8,30" fill="#FFDF00"/><circle cx="50" cy="30" r="11" fill="#002776"/>`
    },
    mexico: {
      name: 'Mexico',
      svg: `<rect width="33.33" height="60" fill="#006847"/><rect x="33.33" width="33.33" height="60" fill="#fff"/><rect x="66.66" width="33.34" height="60" fill="#CE1126"/><circle cx="50" cy="30" r="6" fill="#7d4d1d"/>`
    },
    canada: {
      name: 'Canada',
      svg: `<rect width="100" height="60" fill="#fff"/><rect width="25" height="60" fill="#FF0000"/><rect x="75" width="25" height="60" fill="#FF0000"/><path d="M50,16 L53,24 L60,22 L56,28 L62,32 L54,32 L55,40 L50,35 L45,40 L46,32 L38,32 L44,28 L40,22 L47,24 Z" fill="#FF0000"/>`
    },
    australia: {
      name: 'Australia',
      svg: `<rect width="100" height="60" fill="#012169"/><rect width="50" height="30" fill="#012169"/><path d="M0,0 L50,30 M50,0 L0,30" stroke="#fff" stroke-width="5"/><path d="M25,0 V30 M0,15 H50" stroke="#fff" stroke-width="8"/><path d="M25,0 V30 M0,15 H50" stroke="#C8102E" stroke-width="4"/><circle cx="75" cy="45" r="4" fill="#fff"/><circle cx="86" cy="38" r="3" fill="#fff"/><circle cx="86" cy="52" r="3" fill="#fff"/>`
    },
    turkey: {
      name: 'Turkey',
      svg: `<rect width="100" height="60" fill="#E30A17"/><circle cx="35" cy="30" r="11" fill="#fff"/><circle cx="38" cy="30" r="9" fill="#E30A17"/><polygon points="48,30 54,28 51,33 54,38 48,36 44,40 44,34 39,30 44,30 44,26" fill="#fff"/>`
    },
    greece: {
      name: 'Greece',
      svg: `
        <rect width="100" height="60" fill="#fff"/>
        <g fill="#0D5EAF">
          <rect y="6.7"  width="100" height="6.7"/>
          <rect y="20"   width="100" height="6.7"/>
          <rect y="33.3" width="100" height="6.7"/>
          <rect y="46.7" width="100" height="6.7"/>
        </g>
        <rect width="33.3" height="33.3" fill="#0D5EAF"/>
        <rect x="13.3" width="6.7" height="33.3" fill="#fff"/>
        <rect y="13.3" width="33.3" height="6.7" fill="#fff"/>
      `
    },
    netherlands: {
      name: 'Netherlands',
      svg: `<rect width="100" height="20" fill="#AE1C28"/><rect y="20" width="100" height="20" fill="#fff"/><rect y="40" width="100" height="20" fill="#21468B"/>`
    },
    belgium: {
      name: 'Belgium',
      svg: `<rect width="33.33" height="60" fill="#000"/><rect x="33.33" width="33.33" height="60" fill="#FAE042"/><rect x="66.66" width="33.34" height="60" fill="#ED2939"/>`
    },
    sweden: {
      name: 'Sweden',
      svg: `<rect width="100" height="60" fill="#006AA7"/><rect x="30" width="10" height="60" fill="#FECC00"/><rect y="25" width="100" height="10" fill="#FECC00"/>`
    },
    norway: {
      name: 'Norway',
      svg: `<rect width="100" height="60" fill="#EF2B2D"/><rect x="28" width="14" height="60" fill="#fff"/><rect y="23" width="100" height="14" fill="#fff"/><rect x="32" width="6" height="60" fill="#002868"/><rect y="27" width="100" height="6" fill="#002868"/>`
    },
    finland: {
      name: 'Finland',
      svg: `<rect width="100" height="60" fill="#fff"/><rect x="28" width="14" height="60" fill="#003580"/><rect y="23" width="100" height="14" fill="#003580"/>`
    },
    denmark: {
      name: 'Denmark',
      svg: `<rect width="100" height="60" fill="#C8102E"/><rect x="28" width="9" height="60" fill="#fff"/><rect y="25" width="100" height="9" fill="#fff"/>`
    },
    switzerland: {
      name: 'Switzerland',
      svg: `<rect width="100" height="60" fill="#FF0000"/><rect x="42" y="14" width="16" height="32" fill="#fff"/><rect x="34" y="22" width="32" height="16" fill="#fff"/>`
    },
    portugal: {
      name: 'Portugal',
      svg: `<rect width="100" height="60" fill="#FF0000"/><rect width="40" height="60" fill="#046A38"/><circle cx="40" cy="30" r="9" fill="#FFE15A" stroke="#fff" stroke-width="1.2"/>`
    },
    ireland: {
      name: 'Ireland',
      svg: `<rect width="33.33" height="60" fill="#169B62"/><rect x="33.33" width="33.33" height="60" fill="#fff"/><rect x="66.66" width="33.34" height="60" fill="#FF883E"/>`
    },
    austria: {
      name: 'Austria',
      svg: `<rect width="100" height="60" fill="#ED2939"/><rect y="20" width="100" height="20" fill="#fff"/>`
    },
    czech: {
      name: 'Czechia',
      svg: `<rect width="100" height="30" fill="#fff"/><rect y="30" width="100" height="30" fill="#D7141A"/><polygon points="0,0 50,30 0,60" fill="#11457E"/>`
    },

    // ---------- ALT-HISTORY ----------
    byzantine: {
      name: 'Byzantine Empire',
      svg: `<rect width="100" height="60" fill="#7B0F1B"/><text x="50" y="42" text-anchor="middle" font-family="serif" font-size="44" font-weight="700" fill="#FFD700">B</text>`
    },
    hre: {
      name: 'Holy Roman Empire',
      svg: `<rect width="100" height="60" fill="#FFD700"/><polygon points="50,12 60,30 50,48 40,30" fill="#000"/><text x="50" y="35" text-anchor="middle" font-family="serif" font-size="14" font-weight="700" fill="#FFD700">HRE</text>`
    },
    ussr: {
      name: 'Soviet Union',
      svg: `<rect width="100" height="60" fill="#CC0000"/><polygon points="20,18 23,24 30,24 24,28 26,34 20,30 14,34 16,28 10,24 17,24" fill="#FFD500"/><path d="M30,14 q3,-2 6,2 q3,4 -1,8 q-4,4 -8,-2 z" fill="#FFD500"/>`
    },
    germanempire: {
      name: 'German Empire',
      svg: `<rect width="100" height="20" fill="#000"/><rect y="20" width="100" height="20" fill="#fff"/><rect y="40" width="100" height="20" fill="#FF0000"/>`
    },
    prussia: {
      name: 'Prussia',
      svg: `<rect width="100" height="60" fill="#fff"/><rect y="20" width="100" height="20" fill="#000"/><text x="50" y="14" text-anchor="middle" font-family="serif" font-size="10" font-weight="700" fill="#000">PRUSSIA</text>`
    },
    austriahungary: {
      name: 'Austria-Hungary',
      svg: `<rect width="100" height="20" fill="#ED2939"/><rect y="20" width="100" height="20" fill="#fff"/><rect y="40" width="100" height="20" fill="#006633"/>`
    },
    yugoslavia: {
      name: 'Yugoslavia',
      svg: `<rect width="100" height="20" fill="#0E4DA4"/><rect y="20" width="100" height="20" fill="#fff"/><rect y="40" width="100" height="20" fill="#DE2010"/><polygon points="48,22 52,22 56,26 56,34 52,38 48,38 44,34 44,26" fill="#FFD500"/>`
    },
    roman: {
      name: 'Roman Empire',
      svg: `<rect width="100" height="60" fill="#7B0F1B"/><text x="50" y="42" text-anchor="middle" font-family="Caveat,serif" font-size="38" font-weight="700" fill="#FFD700">SPQR</text>`
    },
    texas: {
      name: 'Texas',
      svg: `<rect width="100" height="60" fill="#fff"/><rect y="30" width="100" height="30" fill="#BF0A30"/><rect width="33.33" height="60" fill="#002868"/><polygon points="10,22 12,28 18,28 13,32 15,38 10,34 5,38 7,32 2,28 8,28" fill="#fff"/>`
    },
    ottoman: {
      name: 'Ottoman Empire',
      svg: `<rect width="100" height="60" fill="#C8102E"/><circle cx="38" cy="30" r="13" fill="#fff"/><circle cx="42" cy="30" r="10" fill="#C8102E"/><polygon points="56,30 64,27 60,33 64,40 56,37 52,42 52,34 46,30 52,30 52,22" fill="#FFD500"/>`
    },
    persian: {
      name: 'Persian Empire',
      svg: `<rect width="100" height="60" fill="#7B0F1B"/><polygon points="50,10 58,20 70,20 60,28 64,40 50,33 36,40 40,28 30,20 42,20" fill="#FFD700"/>`
    },
    kingdomitaly: {
      name: 'Kingdom of Italy',
      svg: `<rect width="33.33" height="60" fill="#009246"/><rect x="33.33" width="33.33" height="60" fill="#fff"/><rect x="66.66" width="33.34" height="60" fill="#CE2B37"/><rect x="40" y="22" width="20" height="16" fill="#0039A6"/>`
    }
  };

  const MODERN_IDS = [
    'usa','uk','france','germany','italy','spain','poland','russia','ukraine','japan',
    'china','skorea','india','brazil','mexico','canada','australia','turkey','greece','netherlands',
    'belgium','sweden','norway','finland','denmark','switzerland','portugal','ireland','austria','czech'
  ];
  const ALT_IDS = [
    'roman','byzantine','hre','prussia','germanempire','austriahungary',
    'yugoslavia','ussr','ottoman','persian','kingdomitaly','texas'
  ];

  // ============================================================
  // ACCESSORIES — each is inner SVG drawn over a 200x200 ball viewBox
  // The countryball circle sits at cx=100 cy=110 r=80 in that viewBox.
  // ============================================================
  const ACCESSORIES = {
    hat: {
      none:    { label: 'None',     glyph: '' },
      tophat:  { label: 'Top hat',  glyph:
        `<rect x="68" y="14" width="64" height="22" fill="#1a1a1a" stroke="#000" stroke-width="2"/>
         <rect x="56" y="34" width="88" height="6"  fill="#1a1a1a" stroke="#000" stroke-width="2"/>
         <rect x="68" y="30" width="64" height="4"  fill="#d97a3d"/>` },
      beret:   { label: 'Beret',    glyph:
        `<ellipse cx="100" cy="34" rx="48" ry="14" fill="#7d1c1c" stroke="#000" stroke-width="2"/>
         <circle cx="128" cy="22" r="6" fill="#7d1c1c" stroke="#000" stroke-width="2"/>` },
      helmet:  { label: 'Helmet',   glyph:
        `<path d="M40,46 Q100,-8 160,46 L160,52 L40,52 Z" fill="#3a3a3a" stroke="#000" stroke-width="2"/>
         <rect x="40" y="48" width="120" height="6" fill="#2a2a2a"/>` },
      crown:   { label: 'Crown',    glyph:
        `<path d="M52,40 L60,16 L80,32 L100,12 L120,32 L140,16 L148,40 Z" fill="#ffcc33" stroke="#7a5a00" stroke-width="2"/>
         <rect x="52" y="40" width="96" height="6" fill="#e0a920" stroke="#7a5a00" stroke-width="2"/>
         <circle cx="100" cy="20" r="3" fill="#e02020"/>` },
      ushanka: { label: 'Ushanka',  glyph:
        `<path d="M48,42 Q100,4 152,42 L150,52 L50,52 Z" fill="#4a2c14" stroke="#000" stroke-width="2"/>
         <ellipse cx="56" cy="46" rx="14" ry="10" fill="#7a4a2a" stroke="#000" stroke-width="2"/>
         <ellipse cx="144" cy="46" rx="14" ry="10" fill="#7a4a2a" stroke="#000" stroke-width="2"/>` }
    },
    eyes: {
      default:  { label: 'Default', glyph:
        `<circle cx="80"  cy="100" r="9" fill="#fff" stroke="#000" stroke-width="2"/>
         <circle cx="120" cy="100" r="9" fill="#fff" stroke="#000" stroke-width="2"/>
         <circle cx="80"  cy="102" r="3" fill="#000"/>
         <circle cx="120" cy="102" r="3" fill="#000"/>` },
      angry:    { label: 'Angry', glyph:
        `<path d="M68,90 L92,98" stroke="#000" stroke-width="3" stroke-linecap="round"/>
         <path d="M132,90 L108,98" stroke="#000" stroke-width="3" stroke-linecap="round"/>
         <circle cx="82"  cy="104" r="5" fill="#000"/>
         <circle cx="118" cy="104" r="5" fill="#000"/>` },
      happy:    { label: 'Happy', glyph:
        `<path d="M72,104 q8,-12 18,0" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
         <path d="M110,104 q8,-12 18,0" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>` },
      derp:     { label: 'Derp', glyph:
        `<circle cx="80"  cy="100" r="10" fill="#fff" stroke="#000" stroke-width="2"/>
         <circle cx="120" cy="100" r="10" fill="#fff" stroke="#000" stroke-width="2"/>
         <circle cx="86"  cy="98"  r="3" fill="#000"/>
         <circle cx="114" cy="104" r="3" fill="#000"/>` },
      monocle:  { label: 'Monocle', glyph:
        `<circle cx="80"  cy="100" r="9"  fill="#fff" stroke="#000" stroke-width="2"/>
         <circle cx="80"  cy="102" r="3"  fill="#000"/>
         <circle cx="120" cy="100" r="13" fill="none" stroke="#FFD700" stroke-width="2.5"/>
         <circle cx="120" cy="102" r="4"  fill="#000"/>
         <path d="M132,108 L138,128" stroke="#FFD700" stroke-width="1.5"/>` },
      sunglasses: { label: 'Shades', glyph:
        `<rect x="62"  y="92" width="32" height="16" rx="4" fill="#1a1a1a" stroke="#000" stroke-width="2"/>
         <rect x="106" y="92" width="32" height="16" rx="4" fill="#1a1a1a" stroke="#000" stroke-width="2"/>
         <rect x="94"  y="98" width="12" height="3"  fill="#1a1a1a"/>` }
    },
    mouth: {
      none:      { label: 'None',     glyph: '' },
      smile:     { label: 'Smile',    glyph:
        `<path d="M82,130 q18,16 36,0" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>` },
      frown:     { label: 'Frown',    glyph:
        `<path d="M82,138 q18,-16 36,0" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>` },
      smirk:     { label: 'Smirk',    glyph:
        `<path d="M86,132 q14,8 28,-4" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>` },
      surprised: { label: 'Surprised',glyph:
        `<ellipse cx="100" cy="134" rx="6" ry="8" fill="#000"/>` }
    },
    prop: {
      none:   { label: 'None',   glyph: '' },
      sword:  { label: 'Sword',  glyph:
        `<rect x="178" y="36" width="6" height="90" fill="#cfcfcf" stroke="#000" stroke-width="1.5" transform="rotate(20 181 81)"/>
         <rect x="170" y="120" width="22" height="6" fill="#7a5a00" transform="rotate(20 181 123)"/>
         <rect x="176" y="126" width="10" height="22" fill="#5a3a14" transform="rotate(20 181 137)"/>` },
      flag:   { label: 'Flag',   glyph:
        `<line x1="36" y1="20" x2="36" y2="180" stroke="#5a3a14" stroke-width="4"/>
         <polygon points="36,20 90,32 36,60" fill="#d97a3d" stroke="#000" stroke-width="1.5"/>` },
      scroll: { label: 'Scroll', glyph:
        `<rect x="148" y="120" width="56" height="34" rx="6" fill="#f1e9c8" stroke="#7a5a00" stroke-width="1.5"/>
         <line x1="156" y1="132" x2="196" y2="132" stroke="#7a5a00" stroke-width="1"/>
         <line x1="156" y1="140" x2="196" y2="140" stroke="#7a5a00" stroke-width="1"/>` },
      mug:    { label: 'Mug',    glyph:
        `<rect x="156" y="130" width="32" height="32" rx="4" fill="#cfcfcf" stroke="#000" stroke-width="1.5"/>
         <path d="M188,138 q12,4 0,16" fill="none" stroke="#000" stroke-width="2"/>
         <rect x="160" y="134" width="24" height="6" fill="#6a4a1a"/>` }
    }
  };

  // ============================================================
  // Storage
  // ============================================================
  const DEFAULT_AVATAR = { country: 'poland', hat: 'none', eyes: 'default', mouth: 'smile', prop: 'none' };

  function getAvatar() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!v || !FLAGS[v.country]) return null;
      return Object.assign({}, DEFAULT_AVATAR, v);
    } catch { return null; }
  }
  function saveAvatar(a) { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); }
  function clearAvatar() { localStorage.removeItem(STORAGE_KEY); }

  // ============================================================
  // SVG builders
  // ============================================================
  function buildBallSVG(state, { size = 200, includeAccessories = true } = {}) {
    const flag = FLAGS[state.country] || FLAGS.poland;
    const uid = 'cb' + Math.random().toString(36).slice(2, 8);
    const accessoryMarkup = includeAccessories
      ? `
        ${(ACCESSORIES.eyes[state.eyes]   || ACCESSORIES.eyes.default).glyph}
        ${(ACCESSORIES.mouth[state.mouth] || ACCESSORIES.mouth.none).glyph}
        ${(ACCESSORIES.hat[state.hat]     || ACCESSORIES.hat.none).glyph}
        ${(ACCESSORIES.prop[state.prop]   || ACCESSORIES.prop.none).glyph}
      `
      : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${flag.name} countryball">
        <defs>
          <clipPath id="${uid}-clip"><circle cx="100" cy="110" r="80"/></clipPath>
          <radialGradient id="${uid}-shine" cx="35%" cy="30%" r="60%">
            <stop offset="0%"  stop-color="#fff" stop-opacity="0.85"/>
            <stop offset="40%" stop-color="#fff" stop-opacity="0.18"/>
            <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="${uid}-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stop-color="#000" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="194" rx="60" ry="8" fill="url(#${uid}-shadow)"/>
        <g clip-path="url(#${uid}-clip)">
          <g transform="translate(50 70) scale(1.0 1.5)">
            <svg viewBox="0 0 100 60" width="100" height="60" preserveAspectRatio="xMidYMid slice">
              ${flag.svg}
            </svg>
          </g>
        </g>
        <circle cx="100" cy="110" r="80" fill="url(#${uid}-shine)" pointer-events="none"/>
        <circle cx="100" cy="110" r="80" fill="none" stroke="#000" stroke-width="3"/>
        ${accessoryMarkup}
      </svg>
    `;
  }

  function buildFlagPreviewSVG(flagId, { size = 44 } = {}) {
    const flag = FLAGS[flagId];
    if (!flag) return '';
    const uid = 'fp' + Math.random().toString(36).slice(2, 8);
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true">
        <defs>
          <clipPath id="${uid}-clip"><circle cx="100" cy="100" r="92"/></clipPath>
          <radialGradient id="${uid}-shine" cx="35%" cy="30%" r="60%">
            <stop offset="0%"  stop-color="#fff" stop-opacity="0.7"/>
            <stop offset="60%" stop-color="#fff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <g clip-path="url(#${uid}-clip)">
          <g transform="translate(40 60) scale(1.2 1.4)">
            <svg viewBox="0 0 100 60" width="100" height="60" preserveAspectRatio="xMidYMid slice">${flag.svg}</svg>
          </g>
        </g>
        <circle cx="100" cy="100" r="92" fill="url(#${uid}-shine)"/>
        <circle cx="100" cy="100" r="92" fill="none" stroke="#000" stroke-width="4"/>
      </svg>
    `;
  }

  // ============================================================
  // Site-wide: render mini avatar in every .user-chip .avatar
  // ============================================================
  function renderUserChips() {
    const a = getAvatar();
    $$('.user-chip .avatar').forEach(el => {
      if (!a) return; // keep letter G
      el.classList.add('countryball');
      el.innerHTML = buildBallSVG(a, { size: 30 });
    });
  }

  // ============================================================
  // Customizer page mount
  // ============================================================
  function mountCustomizer() {
    const root = $('#avatarRoot');
    if (!root) return;

    let state = getAvatar() || Object.assign({}, DEFAULT_AVATAR);
    let tab = 'modern';
    let search = '';

    function visibleIds() {
      const pool = tab === 'modern' ? MODERN_IDS : ALT_IDS;
      if (!search) return pool;
      const q = search.toLowerCase();
      return pool.filter(id => FLAGS[id].name.toLowerCase().includes(q));
    }

    function renderCountries() {
      const grid = $('#countryGrid', root);
      grid.innerHTML = visibleIds().map(id => `
        <button type="button" class="country-chip ${id === state.country ? 'active' : ''}" data-country="${id}">
          ${buildFlagPreviewSVG(id, { size: 48 })}
          <span class="name">${FLAGS[id].name}</span>
        </button>
      `).join('') || `<p class="muted" style="grid-column:1/-1; text-align:center; padding:14px;">No countries match "${search}".</p>`;
      $$('.country-chip', grid).forEach(b => {
        b.addEventListener('click', () => {
          state.country = b.dataset.country;
          renderAll();
        });
      });
    }

    function renderAccessoryGroup(kind) {
      const wrap = $(`#acc-${kind}`, root);
      const entries = Object.entries(ACCESSORIES[kind]);
      wrap.innerHTML = entries.map(([key, val]) => {
        const inner = val.glyph
          ? `<svg viewBox="0 0 200 200" aria-hidden="true">${val.glyph}</svg>`
          : `<span class="none-x">∅</span>`;
        return `
          <button type="button" class="acc-tile ${state[kind] === key ? 'active' : ''}" data-kind="${kind}" data-key="${key}" title="${val.label}">
            ${inner}
          </button>
        `;
      }).join('');
      $$('.acc-tile', wrap).forEach(t => {
        t.addEventListener('click', () => {
          state[t.dataset.kind] = t.dataset.key;
          renderAll();
        });
      });
    }

    function renderPreview() {
      $('#previewName', root).textContent = FLAGS[state.country].name;
      const stage = $('#previewStage', root);
      stage.innerHTML = buildBallSVG(state, { size: 360 });
      // make sure the SVG sizes to the container
      const svg = stage.querySelector('svg');
      if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = '100%'; }
    }

    function renderAll() {
      renderCountries();
      ['hat','eyes','mouth','prop'].forEach(renderAccessoryGroup);
      renderPreview();
    }

    // tabs
    $$('.country-tabs button', root).forEach(b => {
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        $$('.country-tabs button', root).forEach(x => x.classList.toggle('active', x === b));
        renderCountries();
      });
    });

    // search
    $('#countrySearch', root).addEventListener('input', (e) => {
      search = e.target.value;
      renderCountries();
    });

    // actions
    $('#saveAvatar', root).addEventListener('click', () => {
      saveAvatar(state);
      const stage = $('#previewStage', root);
      stage.classList.remove('avatar-saved-pulse');
      void stage.offsetWidth;
      stage.classList.add('avatar-saved-pulse');
      // toast
      const t = document.createElement('div');
      t.className = 'toast show';
      t.textContent = '✓ Avatar saved!';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1800);
      renderUserChips();
    });

    $('#randomAvatar', root).addEventListener('click', () => {
      const pool = tab === 'modern' ? MODERN_IDS : ALT_IDS;
      state = {
        country: pool[Math.floor(Math.random() * pool.length)],
        hat:   pickRandom(ACCESSORIES.hat),
        eyes:  pickRandom(ACCESSORIES.eyes),
        mouth: pickRandom(ACCESSORIES.mouth),
        prop:  pickRandom(ACCESSORIES.prop)
      };
      renderAll();
    });

    $('#resetAvatar', root).addEventListener('click', (e) => {
      e.preventDefault();
      clearAvatar();
      state = Object.assign({}, DEFAULT_AVATAR);
      renderAll();
      renderUserChips();
    });

    renderAll();
  }

  function pickRandom(group) {
    const keys = Object.keys(group);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  // ============================================================
  // Init
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    renderUserChips();
    mountCustomizer();
  });

  // Export for any inline code
  window.HereditaAvatar = { getAvatar, saveAvatar, buildBallSVG, buildFlagPreviewSVG, FLAGS, ACCESSORIES, MODERN_IDS, ALT_IDS };
})();
