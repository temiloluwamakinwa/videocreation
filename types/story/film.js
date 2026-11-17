// "story" video type: an animated, narrated storybook.
// Flat vector scenes (sky, parallax hills, props, characters) are drawn as SVG purely from time t,
// with karaoke captions and a title / end card. A scene's length comes from its narration audio
// (scene.dur, filled in by bin/voiceover.mjs) or from a word-count estimate.
// Characters: built-in people and animals, or kind "avatar" for the user's own picture (spec.avatar).

(async function () {
  const { clamp, lerp, outQ, inOut } = window.M;
  const FORMATS = { vertical: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] };
  const SPEC = window.SPEC || {};
  const [W, H] = FORMATS[SPEC.format] || FORMATS.vertical;
  const S = Math.min(W, H), PORTRAIT = H > W;
  const GY = H * (PORTRAIT ? 0.62 : 0.66);        // ground line
  const FONT = "'Inter Variable', Inter, system-ui, sans-serif";
  await document.fonts.load(`800 40px 'Inter Variable'`).catch(() => {});
  await document.fonts.load(`600 40px 'Inter Variable'`).catch(() => {});
  await document.fonts.ready;

  const stage = document.getElementById('stage'), art = document.getElementById('art'), ui = document.getElementById('ui');
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  art.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px`;
  ui.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px`;

  // ---------- timing ----------
  const TITLE = 2.6, PAD = 0.6, FADE = 0.5, ENDC = 3.2, LEAD = 0.2;
  const raw = (SPEC.scenes || []).slice(0, 14);
  if (!raw.length) throw new Error('story needs at least one scene');
  let acc = TITLE;
  const sc = raw.map((s) => {
    const words = String(s.text || '').trim().split(/\s+/).filter(Boolean);
    const d = Number(s.dur) > 0 ? Number(s.dur) : Math.max(2.4, words.length * 0.4 + 0.8);
    const o = { ...s, words, dur: d + PAD, start: acc };
    acc += o.dur; return o;
  });
  const END = acc + ENDC, endCardT = acc;

  // ---------- avatar ----------
  const avatar = { src: null, aspect: 0.7, ok: false, name: (SPEC.avatar && SPEC.avatar.name) || '' };
  if (SPEC.avatar && SPEC.avatar.file) {
    const url = new URL(SPEC.avatar.file, SPEC.__base || location.href).href;
    await new Promise((res) => {
      const im = new Image();
      im.onload = () => { avatar.src = url; avatar.aspect = im.naturalWidth / im.naturalHeight; avatar.ok = true; res(); };
      im.onerror = () => res(); im.src = url;
    });
  }

  // ---------- palettes ----------
  const SKY = { dawn: ['#FFB38A', '#FFE7D2'], day: ['#6DB6F0', '#E6F5FF'], dusk: ['#4D3F8F', '#FF9A78'], night: ['#0A1230', '#34437E'] };
  const SET = {
    meadow: { far: '#A5D8A6', mid: '#74C47F', ground: '#58AD66' },
    forest: { far: '#4A8A6C', mid: '#36765A', ground: '#2B634C' },
    village: { far: '#B0D9A9', mid: '#82C88A', ground: '#63B171' },
    sea: { far: '#B4E0F1', mid: '#74BBDD', ground: '#F0D9A6', water: '#4AA3D6' },
    desert: { far: '#F4CE92', mid: '#E8B56A', ground: '#DDA050' },
    mountain: { far: '#BBC8E0', mid: '#93A3C4', ground: '#6F8F70' },
    city: { far: '#7B88AA', mid: '#5B668C', ground: '#3F4764' },
    home: { far: '#F6E3CF', mid: '#F1D5B8', ground: '#C9996A' },
    space: { far: '#2B2F63', mid: '#3B3A78', ground: '#6C5B8B' },
  };
  const SKINS = { light: '#F6D3B6', tan: '#E3AC82', brown: '#B97A53', dark: '#7A4A32' };
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.round(clamp(v * k, 0, 255)); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join(''); };
  const f2 = (n) => (+n).toFixed(2);

  // ---------- shapes ----------
  function hills(seed, base, amp, color, off = 0, snow = false) {
    let d = `M ${-80} ${H + 40} L ${-80} ${base}`;
    const pts = [];
    for (let x = -80; x <= W + 80; x += 40) {
      const y = base - amp * (0.5 + 0.5 * Math.sin((x + off) * 0.0042 + seed) * 0.7 + 0.3 * Math.sin((x + off) * 0.011 + seed * 2.3));
      pts.push([x, y]); d += ` L ${x} ${f2(y)}`;
    }
    d += ` L ${W + 80} ${H + 40} Z`;
    return `<path d="${d}" fill="${color}"/>`;
  }
  const star5 = (r, c) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p += `${f2(Math.cos(a) * rr)},${f2(Math.sin(a) * rr)} `; } return `<polygon points="${p}" fill="${c}"/>`; };
  const cloud = (x, y, s, o = 0.9) => `<g transform="translate(${f2(x)} ${f2(y)}) scale(${s})" opacity="${o}" fill="#fff"><ellipse cx="0" cy="0" rx="62" ry="26"/><circle cx="-24" cy="-18" r="26"/><circle cx="14" cy="-28" r="32"/><circle cx="42" cy="-8" r="22"/></g>`;

  // ---------- props (local units: ~100 tall, origin = base centre) ----------
  const PROPS = {
    tree: (t, k) => `<g transform="rotate(${f2(Math.sin(t * 1.1 + k) * 1.2)})"><rect x="-6" y="-48" width="12" height="48" rx="4" fill="#8A5A3B"/><circle cx="0" cy="-78" r="34" fill="#3FA35B"/><circle cx="-24" cy="-60" r="24" fill="#4DB46A"/><circle cx="24" cy="-62" r="24" fill="#37965A"/></g>`,
    pine: (t, k) => `<g transform="rotate(${f2(Math.sin(t * 1.3 + k) * 1)})"><rect x="-5" y="-16" width="10" height="16" fill="#7A4E33"/><polygon points="-34,-14 34,-14 0,-58" fill="#2F7D55"/><polygon points="-28,-44 28,-44 0,-86" fill="#38905F"/><polygon points="-20,-72 20,-72 0,-112" fill="#43A06B"/></g>`,
    house: (t, k, a) => `<rect x="-52" y="-70" width="104" height="70" fill="#F2D6B3"/><polygon points="-64,-68 0,-120 64,-68" fill="#C75B4A"/><rect x="26" y="-112" width="14" height="30" fill="#A64A3C"/><rect x="-12" y="-44" width="26" height="44" rx="3" fill="#8A5A3B"/><rect x="-40" y="-56" width="22" height="22" rx="3" fill="${a.night ? '#FFD36B' : '#BFE4F6'}"/><rect x="22" y="-56" width="22" height="22" rx="3" fill="${a.night ? '#FFD36B' : '#BFE4F6'}"/>`,
    boat: (t, k) => `<g transform="translate(0 ${f2(Math.sin(t * 1.6 + k) * 4)}) rotate(${f2(Math.sin(t * 1.2 + k) * 2.5)})"><path d="M -60 -22 L 60 -22 L 44 0 L -44 0 Z" fill="#B8553E"/><rect x="-2" y="-96" width="4" height="76" fill="#6B4630"/><polygon points="4,-94 4,-30 52,-30" fill="#FFF5E4"/><polygon points="-4,-84 -4,-30 -40,-30" fill="#FFE2B8"/></g>`,
    tent: () => `<polygon points="-56,0 0,-80 56,0" fill="#F08A4B"/><polygon points="-14,0 0,-44 14,0" fill="#7A3E1F"/>`,
    fire: (t) => `<g><ellipse cx="0" cy="0" rx="26" ry="6" fill="#5B4636"/><path d="M 0 ${f2(-46 - Math.sin(t * 11) * 6)} C 22 -22 18 -4 0 -4 C -18 -4 -22 -22 0 ${f2(-46 - Math.sin(t * 11) * 6)} Z" fill="#FF8A3D"/><path d="M 0 ${f2(-30 - Math.sin(t * 13 + 1) * 4)} C 11 -16 9 -4 0 -4 C -9 -4 -11 -16 0 ${f2(-30 - Math.sin(t * 13 + 1) * 4)} Z" fill="#FFD15C"/></g>`,
    lantern: (t) => `<rect x="-3" y="-110" width="6" height="110" fill="#4A4A55"/><circle cx="0" cy="-114" r="${f2(30 + Math.sin(t * 3) * 2)}" fill="#FFD36B" opacity=".25"/><rect x="-10" y="-128" width="20" height="26" rx="6" fill="#FFD36B"/>`,
    flower: (t, k) => `<g transform="rotate(${f2(Math.sin(t * 1.7 + k) * 5)})"><rect x="-1.5" y="-40" width="3" height="40" fill="#3FA35B"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-52" rx="7" ry="11" fill="#F2547D" transform="rotate(${a} 0 -44)"/>`).join('')}<circle cx="0" cy="-44" r="6" fill="#FFD15C"/></g>`,
    balloon: (t, k) => `<g transform="translate(0 ${f2(Math.sin(t * 1.4 + k) * 8)})"><ellipse cx="0" cy="-90" rx="30" ry="38" fill="#F2547D"/><path d="M 0 -52 Q -6 -30 0 0" stroke="#888" fill="none" stroke-width="2"/></g>`,
    rock: () => `<ellipse cx="0" cy="-16" rx="38" ry="22" fill="#9A9CA8"/><ellipse cx="-10" cy="-24" rx="18" ry="9" fill="#B5B7C2"/>`,
    heart: (t, k) => `<g transform="translate(0 ${f2(Math.sin(t * 2 + k) * 6)}) scale(${f2(1 + Math.sin(t * 4) * 0.04)})"><path d="M 0 -20 C -40 -60 -12 -86 0 -64 C 12 -86 40 -60 0 -20 Z" fill="#F2547D"/></g>`,
    gift: () => `<rect x="-30" y="-44" width="60" height="44" rx="4" fill="#6C5CE7"/><rect x="-5" y="-44" width="10" height="44" fill="#FFD15C"/><rect x="-30" y="-30" width="60" height="9" fill="#FFD15C"/><path d="M 0 -44 C -26 -70 -34 -44 0 -44 C 34 -44 26 -70 0 -44" fill="#FFD15C"/>`,
    book: () => `<path d="M 0 -6 L -44 -14 L -44 -52 L 0 -44 Z" fill="#FFF8EA"/><path d="M 0 -6 L 44 -14 L 44 -52 L 0 -44 Z" fill="#F4EAD2"/><path d="M -44 -14 L 0 -6 L 44 -14 L 44 -8 L 0 0 L -44 -8 Z" fill="#6C5CE7"/>`,
    cactus: () => `<rect x="-10" y="-80" width="20" height="80" rx="10" fill="#4F9F63"/><rect x="-34" y="-58" width="12" height="30" rx="6" fill="#4F9F63"/><rect x="-34" y="-34" width="26" height="10" rx="5" fill="#4F9F63"/><rect x="22" y="-66" width="12" height="30" rx="6" fill="#4F9F63"/><rect x="8" y="-42" width="26" height="10" rx="5" fill="#4F9F63"/>`,
    sun: (t) => `<circle r="${f2(60 + Math.sin(t * 1.5) * 3)}" fill="#FFE08A" opacity=".35"/><circle r="40" fill="#FFD15C"/>`,
    moon: () => `<circle r="44" fill="#FFF4D6"/><circle cx="14" cy="-8" r="38" fill="#0A1230" opacity="0"/><circle cx="-12" cy="8" r="8" fill="#E6DCB8"/><circle cx="14" cy="-14" r="5" fill="#E6DCB8"/>`,
    star: (t, k) => `<g transform="scale(${f2(1 + Math.sin(t * 3 + k) * 0.08)})">${star5(34, '#FFE08A')}</g>`,
    cloud: () => '',
  };
  const PROP_SKY = new Set(['sun', 'moon', 'star', 'balloon', 'heart']);
  const PROP_SIZE = { house: 1.4, tree: 1.3, pine: 1.2, boat: 1.3, tent: 1.1, cactus: 1.1 };

  // ---------- characters (local units: ~100 tall, origin = feet, facing right) ----------
  const blink = (t, k) => (((t + k * 0.7) % 3.6) < 0.12 ? 0.1 : 1);
  function person(a, t, mv) {
    const kind = a.kind, ph = mv.walk ? t * 8 : 0, sw = mv.walk ? Math.sin(ph) : 0;
    const skin = SKINS[a.skin] || SKINS[['light', 'tan', 'brown', 'dark'][hash(a.name || kind) % 4]];
    const shirt = a.color || ['#6C5CE7', '#F2547D', '#FF8A3D', '#2BB3A3', '#4C8DF6'][hash((a.name || '') + kind) % 5];
    const hair = a.hair || (kind === 'elder' ? '#E8E8EE' : ['#2B1B12', '#4A2C1A', '#1B1B22', '#7A4A22'][hash(kind + (a.name || '')) % 4]);
    const pants = shade(shirt, 0.55), k = hash(a.name || kind) % 7;
    const sc = kind === 'child' ? 0.72 : kind === 'elder' ? 0.94 : 1;
    const dress = kind === 'girl' || kind === 'woman';
    const armW = mv.wave ? -150 + Math.sin(t * 9) * 22 : 14 + sw * 22;
    const leg = (x, s) => `<line x1="${x}" y1="-34" x2="${f2(x + s * 12)}" y2="-2" stroke="${pants}" stroke-width="8" stroke-linecap="round"/><ellipse cx="${f2(x + s * 12 + 3)}" cy="0" rx="8" ry="4" fill="#2B2B35"/>`;
    const hairBack = kind === 'girl' || kind === 'woman' ? `<path d="M -17 -84 C -24 -62 -20 -50 -12 -50 L 12 -50 C 20 -50 24 -62 17 -84 Z" fill="${hair}"/>` : '';
    const hairTop = kind === 'girl' ? `<path d="M -16 -86 C -14 -102 14 -102 16 -86 C 6 -92 -6 -92 -16 -86 Z" fill="${hair}"/><circle cx="14" cy="-98" r="7" fill="${hair}"/>`
      : kind === 'woman' ? `<path d="M -17 -84 C -16 -104 16 -104 17 -84 C 6 -93 -6 -93 -17 -84 Z" fill="${hair}"/><circle cx="0" cy="-104" r="9" fill="${hair}"/>`
      : kind === 'elder' ? `<path d="M -16 -84 C -16 -100 16 -100 16 -84 C 8 -92 -8 -92 -16 -84 Z" fill="${hair}"/>`
      : `<path d="M -16 -84 C -17 -102 17 -102 16 -84 C 8 -94 -6 -94 -16 -84 Z" fill="${hair}"/>`;
    const extras = kind === 'elder' ? `<circle cx="-5" cy="-80" r="5" fill="none" stroke="#333" stroke-width="1.4"/><circle cx="6" cy="-80" r="5" fill="none" stroke="#333" stroke-width="1.4"/><line x1="0" y1="-80" x2="1" y2="-80" stroke="#333" stroke-width="1.4"/>` : '';
    const body = dress ? `<path d="M -13 -68 L 13 -68 L 22 -26 L -22 -26 Z" fill="${shirt}"/>` : `<rect x="-14" y="-68" width="28" height="36" rx="9" fill="${shirt}"/>`;
    return `<g transform="scale(${sc})">${hairBack}${leg(-6, sw)}${leg(6, -sw)}<line x1="-12" y1="-62" x2="${f2(-12 - Math.sin(armW * Math.PI / 180) * 3)}" y2="-36" stroke="${skin}" stroke-width="7" stroke-linecap="round" transform="rotate(${f2(-armW * 0.3 + (mv.wave ? 0 : 0))} -12 -62)"/>${body}<line x1="12" y1="-62" x2="12" y2="-36" stroke="${skin}" stroke-width="7" stroke-linecap="round" transform="rotate(${f2(armW)} 12 -62)"/><circle cx="0" cy="-80" r="16" fill="${skin}"/>${hairTop}${extras}<ellipse cx="-5.5" cy="-80" rx="1.9" ry="${f2(2.2 * blink(t, k))}" fill="#2B2B35"/><ellipse cx="6" cy="-80" rx="1.9" ry="${f2(2.2 * blink(t, k))}" fill="#2B2B35"/><path d="M -5 -73 Q 0 -69 5 -73" stroke="#7A3A2A" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="-10" cy="-75" r="3" fill="#F2547D" opacity=".25"/><circle cx="11" cy="-75" r="3" fill="#F2547D" opacity=".25"/></g>`;
  }
  const ANIMALS = {
    fox: { body: '#F0873A', belly: '#FFF1DC', ear: '#3A2A22', tail: '#F0873A', tip: '#FFF', snout: '#FFF1DC', ears: 'tri', h: 1 },
    cat: { body: '#9AA0AE', belly: '#E3E5EC', ear: '#F2A1B3', tail: '#9AA0AE', ears: 'tri', h: 0.85 },
    dog: { body: '#C98B55', belly: '#F0D7B6', ear: '#7A4A27', tail: '#C98B55', ears: 'flop', h: 0.9 },
    bear: { body: '#8A5A3B', belly: '#B88866', ear: '#8A5A3B', tail: '#8A5A3B', ears: 'round', h: 1.15, big: 1 },
    rabbit: { body: '#F4F1EC', belly: '#FFFFFF', ear: '#F2A1B3', tail: '#FFFFFF', ears: 'long', h: 0.8, hop: 1 },
  };
  function quad(a, t, mv) {
    const A = ANIMALS[a.kind], c = a.color || A.body, ph = mv.walk ? t * 9 : 0, sw = mv.walk ? Math.sin(ph) : 0;
    const hop = A.hop && mv.walk ? Math.abs(Math.sin(ph * 0.5)) * -14 : 0, big = A.big ? 1.2 : 1;
    const leg = (x, s) => `<line x1="${x}" y1="-24" x2="${f2(x + s * 10)}" y2="-2" stroke="${shade(c, 0.7)}" stroke-width="${8 * big}" stroke-linecap="round"/>`;
    const ears = A.ears === 'tri' ? `<polygon points="14,-58 22,-82 30,-58" fill="${c}"/><polygon points="18,-60 22,-76 27,-60" fill="${A.ear}"/><polygon points="32,-56 42,-78 46,-54" fill="${c}"/>`
      : A.ears === 'long' ? `<ellipse cx="24" cy="-84" rx="7" ry="22" fill="${c}" transform="rotate(-8 24 -84)"/><ellipse cx="24" cy="-84" rx="3.5" ry="16" fill="${A.ear}" transform="rotate(-8 24 -84)"/><ellipse cx="38" cy="-82" rx="7" ry="22" fill="${c}" transform="rotate(10 38 -82)"/>`
      : A.ears === 'flop' ? `<ellipse cx="22" cy="-52" rx="8" ry="16" fill="${A.ear}" transform="rotate(14 22 -52)"/>`
      : `<circle cx="20" cy="-62" r="8" fill="${A.ear}"/><circle cx="42" cy="-62" r="8" fill="${A.ear}"/>`;
    const tail = a.kind === 'fox' ? `<g transform="rotate(${f2(Math.sin(t * 3) * 6)} -26 -30)"><ellipse cx="-44" cy="-36" rx="22" ry="11" fill="${A.tail}" transform="rotate(-22 -44 -36)"/><ellipse cx="-60" cy="-44" rx="9" ry="7" fill="${A.tip}" transform="rotate(-22 -60 -44)"/></g>`
      : a.kind === 'rabbit' ? `<circle cx="-30" cy="-30" r="8" fill="${A.tail}"/>`
      : `<path d="M -28 -30 Q -52 -34 -44 ${f2(-58 + Math.sin(t * 5) * 4)}" stroke="${A.tail}" stroke-width="${8 * big}" fill="none" stroke-linecap="round"/>`;
    return `<g transform="translate(0 ${f2(hop)}) scale(${f2(A.h)})">${tail}${leg(-16, sw)}${leg(14, -sw)}<ellipse cx="0" cy="-34" rx="${32 * big}" ry="${17 * big}" fill="${c}"/><ellipse cx="2" cy="-27" rx="${22 * big}" ry="8" fill="${A.belly}" opacity=".85"/>${leg(-8, -sw)}${leg(22, sw)}${ears}<circle cx="32" cy="-50" r="${14 * big}" fill="${c}"/>${A.snout ? `<ellipse cx="44" cy="-46" rx="10" ry="6" fill="${A.snout}"/>` : ''}<circle cx="${a.kind === 'fox' ? 52 : 44}" cy="-47" r="2.6" fill="#2B2B35"/><circle cx="34" cy="-53" r="2.4" fill="#2B2B35"/></g>`;
  }
  function bird(a, t) { const c = a.color || '#4C8DF6', fl = Math.sin(t * 12) * 18; return `<g transform="translate(0 ${f2(-S * 0.2 / 3.4 + Math.sin(t * 2) * 4)})"><ellipse cx="0" cy="-30" rx="22" ry="15" fill="${c}"/><circle cx="18" cy="-40" r="11" fill="${c}"/><polygon points="27,-40 38,-36 27,-34" fill="#FFB25C"/><circle cx="21" cy="-42" r="2.2" fill="#222"/><path d="M -4 -34 Q -24 ${f2(-60 + fl)} -34 ${f2(-38 + fl)} Z" fill="${shade(c, 0.78)}"/><polygon points="-20,-32 -42,-26 -40,-38" fill="${shade(c, 0.78)}"/></g>`; }
  function owl(a, t) { const c = a.color || '#9A7B5B'; return `<ellipse cx="0" cy="-34" rx="26" ry="34" fill="${c}"/><ellipse cx="0" cy="-26" rx="16" ry="22" fill="#E8D9BC"/><polygon points="-20,-62 -10,-76 -4,-62" fill="${c}"/><polygon points="20,-62 10,-76 4,-62" fill="${c}"/><circle cx="-10" cy="-52" r="9" fill="#fff"/><circle cx="10" cy="-52" r="9" fill="#fff"/><ellipse cx="-10" cy="-52" rx="4.5" ry="${f2(4.5 * blink(t, 2))}" fill="#222"/><circle cx="10" cy="-52" r="4.5" fill="#222"/><polygon points="-4,-46 4,-46 0,-38" fill="#FFB25C"/><line x1="-8" y1="-2" x2="-8" y2="0" stroke="#FFB25C" stroke-width="5"/><line x1="8" y1="-2" x2="8" y2="0" stroke="#FFB25C" stroke-width="5"/>`; }
  function robot(a, t, mv) { const c = a.color || '#8FA3BF', sw = mv.walk ? Math.sin(t * 8) : 0; return `<line x1="-8" y1="-26" x2="${f2(-8 + sw * 8)}" y2="-2" stroke="#55627A" stroke-width="9" stroke-linecap="round"/><line x1="8" y1="-26" x2="${f2(8 - sw * 8)}" y2="-2" stroke="#55627A" stroke-width="9" stroke-linecap="round"/><rect x="-22" y="-70" width="44" height="46" rx="10" fill="${c}"/><rect x="-14" y="-60" width="28" height="14" rx="4" fill="#E6F4FF"/><circle cx="0" cy="-30" r="4" fill="#FFD15C"/><line x1="-22" y1="-58" x2="${f2(-36)}" y2="${f2(-40 + sw * 8)}" stroke="#55627A" stroke-width="7" stroke-linecap="round"/><line x1="22" y1="-58" x2="36" y2="${f2(-40 - sw * 8)}" stroke="#55627A" stroke-width="7" stroke-linecap="round"/><rect x="-18" y="-96" width="36" height="28" rx="9" fill="${c}"/><circle cx="-7" cy="-82" r="${f2(4.5 * blink(t, 3))}" fill="#4C8DF6"/><circle cx="7" cy="-82" r="${f2(4.5 * blink(t, 3))}" fill="#4C8DF6"/><line x1="0" y1="-96" x2="0" y2="-108" stroke="#55627A" stroke-width="3"/><circle cx="0" cy="-110" r="4" fill="#F2547D"/>`; }
  function avatarDraw(a, t, mv) {
    if (!avatar.ok) { const c = a.color || '#6C5CE7'; return `<circle cx="0" cy="-60" r="40" fill="${c}"/><text x="0" y="-48" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="40" fill="#fff">${(avatar.name || a.name || '?').slice(0, 1).toUpperCase()}</text>`; }
    const h = 118, w = h * avatar.aspect;
    return `<image href="${avatar.src}" x="${f2(-w / 2)}" y="${-h}" width="${f2(w)}" height="${h}" preserveAspectRatio="xMidYMax meet"/>`;
  }

  function drawActor(a, t, lt, p, i) {
    const k = hash(a.name || a.kind) % 9;
    const x0 = clamp(Number(a.x ?? 50), 6, 94), x1 = a.moveTo != null ? clamp(Number(a.moveTo), 6, 94) : x0;
    const e = inOut(clamp(lt / Math.max(1, (a._dur || 4))));
    const px = lerp(x0, x1, e) / 100 * W;
    const moving = Math.abs(x1 - x0) > 1 && p < 0.98 && p > 0.02;
    const act = a.action || (moving ? 'walk' : 'idle');
    const mv = { walk: moving || act === 'walk', wave: act === 'wave' };
    const dir = a.face ? (a.face === 'left' ? -1 : 1) : (x1 < x0 ? -1 : 1);
    const flip = a.kind === 'avatar' ? (a.face === 'left' ? -1 : (x1 < x0 ? -1 : 1)) : dir;
    const size = S * 0.0034 * (Number(a.scale) > 0 ? clamp(Number(a.scale), 0.5, 2) : 1) * (a.kind === 'avatar' ? 3.1 / 3.4 * 1 : 1);
    const baseY = GY + S * 0.075 + (a.depth ? clamp(a.depth, -1, 1) * S * 0.05 : 0) + i * 2;
    let bob = mv.walk ? Math.abs(Math.sin(t * 8)) * -4 : Math.sin(t * 2.2 + k) * -2.2;
    if (act === 'jump') bob = -Math.abs(Math.sin(t * 5 + k)) * 34;
    const tilt = act === 'dance' ? Math.sin(t * 6) * 7 : (a.kind === 'avatar' ? (mv.walk ? Math.sin(t * 8) * 4 : Math.sin(t * 2 + k) * 1.2) : 0);
    const squash = a.kind === 'avatar' && !mv.walk ? 1 + Math.sin(t * 2.2 + k) * 0.012 : 1;
    let g;
    if (a.kind === 'avatar') g = avatarDraw(a, t, mv);
    else if (ANIMALS[a.kind]) g = quad(a, t, mv);
    else if (a.kind === 'bird') g = bird(a, t);
    else if (a.kind === 'owl') g = owl(a, t);
    else if (a.kind === 'robot') g = robot(a, t, mv);
    else g = person({ ...a, kind: ['girl', 'boy', 'man', 'woman', 'elder', 'child'].includes(a.kind) ? a.kind : 'boy' }, t, mv);
    const shadow = `<ellipse cx="0" cy="0" rx="${a.kind === 'bird' ? 16 : 30}" ry="6" fill="#000" opacity=".16"/>`;
    return `<g transform="translate(${f2(px)} ${f2(baseY)}) scale(${f2(size * flip)} ${f2(size)})">${shadow}<g transform="translate(0 ${f2(bob)}) rotate(${f2(tilt)}) scale(1 ${f2(squash)})">${g}</g></g>`;
  }

  // ---------- one scene ----------
  function sceneSVG(s, lt, t, i) {
    const p = clamp(lt / s.dur), time = SKY[s.time] ? s.time : 'day', set = SET[s.setting] ? s.setting : 'meadow', P = SET[set];
    const cam = s.camera || 'push';
    const z = cam === 'push' ? 1 + 0.1 * p : cam === 'pull' ? 1.1 - 0.1 * p : 1.03 + 0.02 * p;
    const cx = (cam === 'left' ? lerp(S * 0.04, -S * 0.04, p) : cam === 'right' ? lerp(-S * 0.04, S * 0.04, p) : 0);
    const L = (f) => `translate(${W / 2} ${GY}) scale(${f2(1 + (z - 1) * f)}) translate(${f2(-W / 2 + cx * f)} ${f2(-GY)})`;
    const night = time === 'night', sky = SKY[set === 'space' ? 'night' : time];
    const ctx = { night };
    let o = `<defs><linearGradient id="sk${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${set === 'space' ? '#050816' : sky[0]}"/><stop offset="1" stop-color="${set === 'space' ? '#1B1F4B' : sky[1]}"/></linearGradient></defs>`;
    o += `<rect width="${W}" height="${H}" fill="url(#sk${i})"/>`;
    // sky layer
    let skyL = '';
    if (night || set === 'space') for (let n = 0; n < 46; n++) { const sx = (hash('s' + n) % 1000) / 1000 * W, sy = (hash('y' + n) % 1000) / 1000 * GY * 0.8; skyL += `<circle cx="${f2(sx)}" cy="${f2(sy)}" r="${1.4 + (n % 3)}" fill="#fff" opacity="${f2(0.5 + 0.5 * Math.sin(t * 2 + n))}"/>`; }
    const sunY = time === 'day' ? GY * 0.3 : GY * 0.78, sunX = W * (time === 'dawn' ? 0.25 : time === 'dusk' ? 0.75 : 0.72);
    const auto = (s.props || []).some((q) => q.kind === 'sun' || q.kind === 'moon');
    if (!auto && set !== 'home' && set !== 'space') skyL += `<g transform="translate(${f2(sunX)} ${f2(sunY)}) scale(${f2(S * 0.0026)})">${night ? PROPS.moon() : PROPS.sun(t)}</g>`;
    if (!night && set !== 'space' && set !== 'home') for (let n = 0; n < 3; n++) skyL += cloud(((hash('c' + n + i) % 1000) / 1000 * W * 1.2 + t * (10 + n * 4)) % (W * 1.3) - W * 0.15, GY * (0.16 + n * 0.12), S * 0.0011 * (1 + n * 0.25), 0.9);
    o += `<g transform="${L(0.15)}">${skyL}</g>`;
    // far + mid
    if (set === 'home') {
      o += `<rect width="${W}" height="${GY + S * 0.08}" fill="${P.far}"/><rect y="${GY * 0.9}" width="${W}" height="${H}" fill="${P.ground}"/><rect x="${W * 0.62}" y="${GY * 0.28}" width="${S * 0.26}" height="${S * 0.3}" rx="14" fill="url(#sk${i})" stroke="#fff" stroke-width="${S * 0.012}"/><ellipse cx="${W / 2}" cy="${GY + S * 0.12}" rx="${S * 0.36}" ry="${S * 0.05}" fill="#E36B6B" opacity=".55"/>`;
    } else {
      let far = '', mid = '';
      if (set === 'city') for (let n = 0; n < 16; n++) { const bw = S * 0.1, bh = S * (0.18 + (hash('b' + n + set) % 100) / 100 * 0.3); far += `<rect x="${n * bw - 20}" y="${GY - bh}" width="${bw - 6}" height="${bh + 40}" fill="${n % 2 ? P.far : P.mid}"/>` + (night ? Array.from({ length: 6 }, (_, w) => `<rect x="${n * bw + 8 + (w % 2) * bw * 0.4}" y="${GY - bh + 16 + Math.floor(w / 2) * 34}" width="14" height="18" fill="#FFD36B" opacity="${(hash('w' + n + w) % 3) ? 0.9 : 0.2}"/>`).join('') : ''); }
      else if (set === 'mountain') { for (let n = 0; n < 4; n++) { const mx = (n * 0.3 - 0.05) * W, mh = S * (0.34 + n % 2 * 0.12); far += `<polygon points="${mx - S * 0.3},${GY} ${mx},${GY - mh} ${mx + S * 0.3},${GY}" fill="${P.far}"/><polygon points="${mx - S * 0.07},${GY - mh * 0.78} ${mx},${GY - mh} ${mx + S * 0.07},${GY - mh * 0.78}" fill="#fff"/>`; } mid = hills(2.1, GY - S * 0.03, S * 0.1, P.mid); }
      else if (set === 'sea') { far = hills(0.7, GY - S * 0.12, S * 0.05, P.far); mid = `<rect y="${GY - S * 0.1}" width="${W}" height="${S * 0.22}" fill="${P.water}"/>` + Array.from({ length: 9 }, (_, n) => `<path d="M ${n * W / 8 - 60} ${GY - S * 0.04 + (n % 3) * S * 0.03 + Math.sin(t * 1.5 + n) * 4} q 30 -10 60 0 t 60 0" stroke="#fff" stroke-width="3" fill="none" opacity=".55"/>`).join(''); }
      else { far = hills(1.3, GY - S * 0.07, S * 0.14, P.far); mid = hills(4.2, GY - S * 0.02, S * 0.09, P.mid, 200); }
      o += `<g transform="${L(0.4)}">${far}</g><g transform="${L(0.7)}">${mid}</g>`;
      o += `<g transform="${L(1)}"><rect x="-200" y="${(set === 'sea' ? GY + S * 0.1 : GY) - 2}" width="${W + 400}" height="${H}" fill="${P.ground}"/></g>`;
    }
    // props and actors on the near layer
    let near = '';
    const props = (s.props || []).slice(0, 10);
    props.forEach((q, n) => {
      const fn = PROPS[q.kind]; if (!fn) return;
      const sky = PROP_SKY.has(q.kind), sz = S * 0.0034 * (PROP_SIZE[q.kind] || 1) * (Number(q.scale) > 0 ? clamp(q.scale, 0.4, 2.5) : 1);
      const x = clamp(Number(q.x ?? 50), 0, 100) / 100 * W;
      const y = q.kind === 'sun' || q.kind === 'moon' ? GY * 0.3 : sky && q.kind !== 'heart' && q.kind !== 'balloon' ? GY * 0.4 : GY + S * 0.045 + (q.back ? -S * 0.025 : S * 0.03 * (n % 2));
      near += `<g transform="translate(${f2(x)} ${f2(y)}) scale(${f2(sz)})">${fn(t, n, ctx)}</g>`;
    });
    (s.actors || []).slice(0, 4).forEach((a, n) => { near += drawActor({ ...a, _dur: s.dur }, t, lt, p, n); });
    o += `<g transform="${L(1)}">${near}</g>`;
    // weather + grade
    if (s.weather === 'rain') for (let n = 0; n < 70; n++) { const rx = (hash('r' + n) % 1000) / 1000 * W, ry = (((hash('q' + n) % 1000) / 1000 * H + t * 900) % (H + 80)) - 40; o += `<line x1="${f2(rx)}" y1="${f2(ry)}" x2="${f2(rx - 12)}" y2="${f2(ry + 40)}" stroke="#DFF1FF" stroke-width="2.5" opacity=".6"/>`; }
    if (s.weather === 'snow') for (let n = 0; n < 60; n++) { const rx = ((hash('r' + n) % 1000) / 1000 * W + Math.sin(t + n) * 30), ry = (((hash('q' + n) % 1000) / 1000 * H + t * 120) % (H + 40)) - 20; o += `<circle cx="${f2(rx)}" cy="${f2(ry)}" r="${3 + n % 4}" fill="#fff" opacity=".85"/>`; }
    if (night && set !== 'space') o += `<rect width="${W}" height="${H}" fill="#0A1240" opacity=".28"/>`;
    if (time === 'dusk') o += `<rect width="${W}" height="${H}" fill="#FF7A50" opacity=".1"/>`;
    return o;
  }

  // ---------- UI: captions, title, end ----------
  const css = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');
  const capSize = Math.round(S * 0.052), capW = PORTRAIT ? W * 0.86 : W * 0.66;
  function captions(s, lt) {
    const n = s.words.length; if (!n || lt < 0) return '';
    const t0 = LEAD, t1 = Math.max(t0 + 1, s.dur - PAD), tot = s.words.reduce((a, w) => a + w.length + 2, 0);
    let acc2 = t0; const spans = s.words.map((w) => { const a = acc2; acc2 += (t1 - t0) * (w.length + 2) / tot; return [w, a, acc2]; });
    const fade = clamp(lt / 0.3) * (1 - clamp((lt - (s.dur - 0.25)) / 0.25));
    const html = spans.map(([w, a, b]) => {
      const cur = lt >= a && lt < b, done = lt >= b;
      const st = cur ? css({ color: '#2a1404', background: '#FFC25C', transform: 'scale(1.06)' }) : css({ color: '#fff', opacity: done ? 1 : 0.5 });
      return `<span style="${st};display:inline-block;padding:${Math.round(capSize * 0.08)}px ${Math.round(capSize * 0.22)}px;border-radius:${Math.round(capSize * 0.4)}px;margin:0 ${Math.round(capSize * 0.04)}px">${w.replace(/</g, '&lt;')}</span>`;
    }).join('');
    return `<div style="${css({ position: 'absolute', left: ((W - capW) / 2) + 'px', width: capW + 'px', bottom: Math.round(H * (PORTRAIT ? 0.07 : 0.07)) + 'px', 'text-align': 'center', 'font-weight': 700, 'font-size': capSize + 'px', 'line-height': 1.35, 'font-family': FONT, opacity: f2(fade), padding: `${capSize * 0.5}px ${capSize * 0.6}px`, background: 'rgba(14,10,30,.62)', 'border-radius': capSize * 0.9 + 'px', 'box-sizing': 'border-box', 'text-shadow': '0 2px 8px rgba(0,0,0,.35)' })}">${html}</div>`;
  }
  const title = String(SPEC.title || 'A Story').slice(0, 60);
  function titleCard(t) {
    const o = 1 - inOut(clamp((t - (TITLE - 0.7)) / 0.7)); if (o <= 0.001) return '';
    const e = outQ(clamp(t / 0.8));
    const av = avatar.ok ? `<img src="${avatar.src}" style="${css({ height: S * 0.2 + 'px', 'margin-bottom': S * 0.03 + 'px', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,.35))' })}">` : '';
    return `<div style="${css({ position: 'absolute', inset: 0, background: 'rgba(14,10,36,.58)', opacity: f2(o), display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', 'text-align': 'center', color: '#fff', 'font-family': FONT, padding: '0 ' + W * 0.08 + 'px' })}"><div style="transform:translateY(${f2((1 - e) * 30)}px);opacity:${f2(e)}">${av}<div style="${css({ 'font-size': S * 0.026 + 'px', 'letter-spacing': '.28em', 'font-weight': 700, color: '#FFC25C', 'margin-bottom': S * 0.025 + 'px' })}">AN ANIMATED STORY</div><div style="${css({ 'font-size': S * (title.length > 26 ? 0.074 : 0.095) + 'px', 'font-weight': 800, 'line-height': 1.05, 'letter-spacing': '-.03em' })}">${title.replace(/</g, '&lt;')}</div></div></div>`;
  }
  function endCard(t) {
    const x = clamp((t - endCardT) / 0.8); if (x <= 0) return '';
    const e = outQ(x);
    return `<div style="${css({ position: 'absolute', inset: 0, background: 'rgba(14,10,36,.78)', opacity: f2(inOut(x)), display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'justify-content': 'center', color: '#fff', 'font-family': FONT, 'text-align': 'center', padding: '0 ' + W * 0.08 + 'px' })}"><div style="transform:translateY(${f2((1 - e) * 24)}px)"><div style="font-size:${Math.round(S * 0.11)}px;font-weight:800;letter-spacing:-.03em;color:#FFC25C;font-style:italic">The End</div><div style="font-size:${Math.round(S * 0.034)}px;font-weight:600;margin-top:${S * 0.02}px;opacity:.85">${title.replace(/</g, '&lt;')}</div></div></div>`;
  }

  // ---------- seek ----------
  function active(t) { let i = 0; for (let n = 0; n < sc.length; n++) if (t >= sc[n].start) i = n; return i; }
  function seek(t) {
    t = clamp(t, 0, END);
    const i = active(t), s = sc[i], lt = Math.max(0, t - s.start);
    let svg = '';
    if (i > 0 && lt < FADE) { const q = sc[i - 1]; svg += `<g>${sceneSVG(q, Math.min(q.dur, t - q.start), t, i - 1)}</g>`; }
    const op = i > 0 ? clamp(lt / FADE) : 1;
    svg += `<g opacity="${f2(op)}">${sceneSVG(s, lt, t, i)}</g>`;
    art.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
    const capsOn = t >= TITLE - 0.2 && t < endCardT;
    ui.innerHTML = (capsOn ? captions(s, lt) : '') + titleCard(t) + endCard(t);
  }

  const cues = [{ t: 0.15, k: 'shimmer' }];
  sc.forEach((s, n) => { if (n) cues.push({ t: s.start - 0.04, k: 'whoosh', v: 0.5 }); cues.push({ t: s.start + 0.05, k: 'note', n: n * 2 }); });
  cues.push({ t: endCardT + 0.1, k: 'check' });
  window.seek = seek;
  window.FILM = {
    type: 'story', width: W, height: H, bpm: 76, calm: true, duration: +END.toFixed(3),
    cues, sections: { intro: [0, TITLE], outro: [endCardT, END] },
    voice: sc.filter((s) => s.audio).map((s) => ({ t: +(s.start + LEAD).toFixed(3), file: s.audio })),
  };
  seek(0);
  window.READY = true;
})().catch((e) => { window.FILM_ERROR = String(e && e.stack || e); console.error(e); });
