import { useId } from "react";
import { getJarBody } from "../jarBodies.mjs";
import JarSlotOverlay from "./JarSlotOverlay";

/** 480 좌표의 저금통·사진 창·장식을 겹쳐 모든 화면에서 같은 완성 모습을 만든다. */
export default function JarBodyArtwork({ bodyStyle, imageUrl, imageRendering = "auto", className = "", alt = "선택한 저금통", onImageLoad, onImageError, showDefaultSlot = false, imageStyle }) {
  const id = useId().replace(/:/g, "");
  const body = getJarBody(bodyStyle);
  if (!body) return null;
  const { colors: c, window: w } = body;
  const paint = (name) => `url(#${id}-${name})`;
  return <div role="img" aria-label={alt} className={`relative aspect-square isolate ${className}`} data-jar-body={body.id}>
    <svg aria-hidden="true" viewBox="0 0 480 480" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2=".8"><stop stopColor={c.light}/><stop offset=".3" stopColor={c.base}/><stop offset=".6" stopColor={c.light}/><stop offset="1" stopColor={c.shade}/></linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2=".2"><stop stopColor={c.accent}/><stop offset=".35" stopColor="#f7e8be"/><stop offset=".62" stopColor={c.accent}/><stop offset="1" stopColor="#765535"/></linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#fff"/><stop offset=".45" stopColor={c.light}/><stop offset="1" stopColor={c.shade}/></linearGradient>
        <radialGradient id={`${id}-shadow`}><stop stopColor="#344239" stopOpacity=".22"/><stop offset="1" stopColor="#344239" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".85"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        <clipPath id={`${id}-body-clip`}><path d={body.path}/></clipPath>
        <mask id={`${id}-photo-safe`}><rect width="480" height="480" fill="white"/><rect x={w.x-4} y={w.y-4} width={w.width+8} height={w.height+8} rx={w.radius+4} fill="black"/></mask>
      </defs>
      <ellipse cx="240" cy="441" rx="164" ry="23" fill={paint("shadow")}/>
      <Decorations body={body} paint={paint} layer="back"/>
      <path d={body.path} fill={c.shade} opacity=".18" transform="translate(0 7)"/>
      <path d={body.path} fill={paint("body")} stroke={c.shade} strokeWidth="3" strokeLinejoin="round"/>
      <g clipPath={paint("body-clip")}>
        <path d="M125 54Q81 247 126 444L155 444Q111 251 154 53Z" fill={paint("shine")} opacity=".65"/>
        <path d="M365 66Q404 269 352 425" fill="none" stroke={c.shade} strokeWidth="20" opacity=".15"/>
        <path d={body.path} transform="translate(240 245) scale(.965) translate(-240 -245)" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2"/>
      </g>
      <rect x={w.x-7} y={w.y-7} width={w.width+14} height={w.height+14} rx={w.radius+7} fill={paint("rim")} stroke={c.shade} strokeOpacity=".6" strokeWidth="1.5"/>
      <rect x={w.x} y={w.y} width={w.width} height={w.height} rx={w.radius} fill="#fffdf8"/>
      {!imageUrl && <g transform={`translate(${w.x+w.width/2} ${w.y+w.height/2})`} fill="none" stroke={c.accent} strokeWidth="2">
        <circle r="27" opacity=".3"/><path d="M0-18Q3-3 18 0Q3 3 0 18Q-3 3-18 0Q-3-3 0-18Z" fill={c.accent} opacity=".7"/>
        <path d="M-40-25v10m-5-5h10M37 22v12m-6-6h12" strokeLinecap="round" opacity=".5"/>
        <circle cx="-27" cy="30" r="2" fill={c.accent} stroke="none"/><circle cx="29" cy="-28" r="2" fill={c.accent} stroke="none"/>
      </g>}
    </svg>
    {imageUrl && <div className="absolute overflow-hidden" style={{ left:`${w.x/4.8}%`,top:`${w.y/4.8}%`,width:`${w.width/4.8}%`,height:`${w.height/4.8}%`,borderRadius:`${w.radius/w.width*100}% / ${w.radius/w.height*100}%`,background:"#fffdf8" }}>
      {/* HTML img를 사용해 만료 URL 재시도와 자연 크기 검증 콜백을 기존 흐름 그대로 유지한다. */}
      {/* 마스크 좌표는 480 정사각형 기준이다. 직사각형 사진 창에서도 img 자체는 정사각형으로 유지한다. */}
      <img src={imageUrl} alt="" draggable={false} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none object-contain" style={{ ...imageStyle, imageRendering, width: `${Math.min(w.width,w.height)/w.width*100}%`, height: `${Math.min(w.width,w.height)/w.height*100}%` }} onLoad={onImageLoad} onError={onImageError}/>
    </div>}
    <svg aria-hidden="true" viewBox="0 0 480 480" className="pointer-events-none absolute inset-0 h-full w-full">
      <rect x={w.x} y={w.y} width={w.width} height={w.height} rx={w.radius} fill="none" stroke={c.shade} strokeOpacity=".4" strokeWidth="2"/>
      <path d={`M${w.x+18} ${w.y-3}H${w.x+w.width-18}`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
      <g mask={body.id === "PLANET" ? paint("photo-safe") : undefined}><Decorations body={body} paint={paint} layer="front"/></g>
    </svg>
    {showDefaultSlot && <JarSlotOverlay slot={body.slot}/>}
  </div>;
}

/** 본체별 뚜껑·귀·고리·받침을 별도 도형으로 그려 실루엣과 재질을 구분한다. */
function Decorations({ body, paint, layer }) {
  const { id, colors:c } = body;
  if (layer === "back") {
    if (id === "TEAPOT") return <ellipse cx="354" cy="253" rx="49" ry="68" fill="none" stroke={c.shade} strokeWidth="23"/>;
    if (id === "LANTERN") return <path d="M197 112V75Q240 15 283 75V112" fill="none" stroke={c.accent} strokeWidth="12"/>;
    if (id === "PLANET") return <ellipse cx="240" cy="267" rx="217" ry="53" transform="rotate(-24 240 267)" fill="none" stroke={c.accent} strokeWidth="14"/>;
    return null;
  }
  const cap = (x,y,w,h,r=10) => <g><rect x={x} y={y} width={w} height={h} rx={r} fill={paint("metal")} stroke={c.accent} strokeWidth="2"/><path d={`M${x+8} ${y+7}H${x+w-8}`} stroke="#fff7df" strokeOpacity=".75" strokeWidth="3" strokeLinecap="round"/></g>;
  const eyes = (y, x=205, gap=70) => <g fill="#45403d"><ellipse cx={x} cy={y} rx="5" ry="7"/><ellipse cx={x+gap} cy={y} rx="5" ry="7"/><circle cx={x-1} cy={y-2} r="1.6" fill="#fff"/><circle cx={x+gap-1} cy={y-2} r="1.6" fill="#fff"/></g>;
  switch(id) {
    case "CLASSIC": return <>{cap(145,99,190,49)}<path d="M145 156H335" stroke={c.shade} strokeWidth="4" opacity=".5"/></>;
    case "BELLO": return <><ellipse cx="240" cy="107" rx="47" ry="12" fill={paint("rim")}/><path d="M154 403Q240 438 326 403" stroke={c.accent} strokeWidth="3" fill="none" opacity=".55"/></>;
    case "APOTHECARY": return <>{cap(184,56,112,54,6)}<path d="M162 179H318" stroke={c.accent} strokeWidth="2" opacity=".3"/></>;
    case "MILK": return <>{cap(185,60,110,31,9)}<path d="M175 150H305" stroke={c.shade} strokeWidth="7" opacity=".7"/><path d="M182 416H298" stroke={c.accent} strokeWidth="3" opacity=".6"/></>;
    case "FACET": return <g fill="none" stroke={c.shade} strokeOpacity=".45"><path d="M167 114L139 191L107 178M313 114L341 191L373 178M107 357L139 364L163 419M373 357L341 364L317 419" strokeWidth="3"/><path d="M167 114H313" stroke={c.accent} strokeWidth="8"/></g>;
    case "PERFUME": return <>{cap(172,61,136,53,10)}<path d="M176 165H304" stroke={c.accent} strokeWidth="4"/><circle cx="240" cy="400" r="7" fill={paint("metal")}/></>;
    case "DOME": return <>{cap(81,357,318,49,12)}<rect x="106" y="408" width="268" height="15" rx="7" fill={c.accent}/><path d="M115 208Q124 124 192 110" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity=".75"/></>;
    case "HEART": return <g fill="none" strokeLinecap="round"><path d="M99 169C102 113 158 104 184 126" stroke="#fff" strokeWidth="11" opacity=".8"/><path d="M210 378L240 402L270 378" stroke={c.accent} strokeWidth="2" opacity=".65"/></g>;
    case "STAR": return <g fill="#fff9dd" stroke={c.accent} strokeWidth="2"><path d="M233 95L218 139" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"/><circle cx="127" cy="205" r="4"/><circle cx="353" cy="205" r="4"/><circle cx="165" cy="326" r="4"/><circle cx="315" cy="326" r="4"/></g>;
    case "MOON": return <g fill={c.accent} opacity=".45"><circle cx="137" cy="352" r="10"/><circle cx="179" cy="385" r="5"/><circle cx="120" cy="188" r="4"/><path d="M343 156l5 14 14 5-14 5-5 14-5-14-14-5 14-5Z"/><path d="M296 226l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"/></g>;
    case "CLOUD": return <g fill="none" strokeLinecap="round"><path d="M153 166Q132 141 110 155M226 121Q256 92 281 115" stroke="#fff" strokeWidth="8"/><path d="M140 389v12m44-7v20m155-25v15" stroke={c.shade} strokeWidth="7" opacity=".65"/></g>;
    case "SHELL": return <g fill="none" stroke={c.shade} strokeWidth="3" opacity=".55"><path d="M123 157L152 210M202 112L210 203M286 112L274 203M363 157L328 210M74 259L134 296M406 259L346 296"/><path d="M162 410Q240 439 318 410" stroke={c.accent} strokeWidth="7"/></g>;
    case "PEARL": return <><path d="M111 187Q122 126 181 109" stroke="#fff" strokeWidth="15" fill="none" strokeLinecap="round" opacity=".8"/>{cap(177,405,126,17,7)}<circle cx="367" cy="303" r="8" fill="#fff" opacity=".45"/></>;
    case "CRYSTAL": return <g fill="none" stroke={c.shade} strokeWidth="3" opacity=".6"><path d="M181 67L158 196L97 175M299 67L322 196L383 175M138 380L158 364L240 429L322 364L342 380M181 67L240 122L299 67"/><path d="M181 80L115 169" stroke="#fff" strokeWidth="7" strokeLinecap="round"/></g>;
    case "PLANET": return <><path d="M53 330C126 369 383 246 425 191" stroke={paint("metal")} strokeWidth="11" fill="none"/><circle cx="374" cy="102" r="9" fill={c.accent}/><circle cx="104" cy="130" r="4" fill={c.accent}/></>;
    case "ROCKET": return <><path d="M195 116L240 63L285 116Z" fill={c.accent} opacity=".7"/><path d="M210 401L225 440L240 414L254 440L271 401" fill="#efc774"/><path d="M123 320L161 286L156 360Z M357 320L319 286L324 360Z" fill={c.accent} opacity=".6"/></>;
    case "HOUSE": return <><path d="M77 209L240 65L403 209L387 230L240 103L93 230Z" fill={c.accent} stroke="#fff" strokeOpacity=".4" strokeWidth="2"/><path d="M315 127V79H348V156" fill={c.shade}/><circle cx="240" cy="156" r="15" fill={paint("metal")}/></>;
    case "CASTLE": return <g fill={c.accent}><path d="M60 180L114 97L169 180Z"/><path d="M175 138L240 55L305 138Z M311 180L366 97L420 180Z"/><path d="M240 55V28L272 37L240 45"/><path d="M102 215h25v29h-25M353 215h25v29h-25" fill={c.light}/></g>;
    case "TEAPOT": return <>{cap(164,139,133,24,12)}<ellipse cx="230" cy="129" rx="21" ry="14" fill={paint("metal")}/><path d="M64 219L92 283" stroke="#fff" strokeWidth="6" strokeLinecap="round"/><path d="M354 202Q403 218 382 288" stroke={c.light} strokeWidth="5" fill="none"/></>;
    case "LANTERN": return <>{cap(132,124,216,39,6)}<path d="M151 124L192 87H288L329 124Z" fill={paint("metal")}/><path d="M143 184L126 363M337 184L354 363" stroke={c.accent} strokeWidth="10"/>{cap(112,374,256,35,7)}</>;
    case "PIG": return <><path d="M144 105L175 128L149 145Z M336 105L305 128L331 145Z" fill={c.shade}/>{eyes(187,185,110)}<ellipse cx="240" cy="213" rx="28" ry="19" fill={c.shade} opacity=".65"/><g fill="#986974"><ellipse cx="230" cy="213" rx="3" ry="5"/><ellipse cx="250" cy="213" rx="3" ry="5"/></g></>;
    case "CAT": return <><path d="M137 85L172 121L147 159Z M343 85L308 121L333 159Z" fill="#dfb7ab"/>{eyes(197)}<path d="M232 214L240 220L248 214M240 221Q225 234 214 221M240 221Q255 234 266 221" fill="none" stroke="#8e7761" strokeWidth="3" strokeLinecap="round"/><path d="M151 214L185 220M329 214L295 220" stroke={c.shade} strokeWidth="3"/></>;
    case "BEAR": return <><circle cx="152" cy="90" r="19" fill={c.shade} opacity=".55"/><circle cx="334" cy="94" r="19" fill={c.shade} opacity=".55"/>{eyes(190)}<ellipse cx="240" cy="218" rx="35" ry="22" fill={c.light}/><path d="M230 209Q240 202 250 209L240 219Z" fill="#725d4f"/></>;
    case "RABBIT": return <><path d="M178 59Q168 93 191 143M302 59Q312 93 289 143" fill="none" stroke="#e8afbd" strokeWidth="12" strokeLinecap="round"/>{eyes(222,208,64)}<path d="M234 240L240 246L246 240" fill="#ce92a1"/></>;
    case "PANDA": return <><circle cx="138" cy="100" r="25" fill="#576261"/><circle cx="344" cy="100" r="25" fill="#576261"/><ellipse cx="193" cy="202" rx="23" ry="29" transform="rotate(25 193 202)" fill="#576261"/><ellipse cx="287" cy="202" rx="23" ry="29" transform="rotate(-25 287 202)" fill="#576261"/><circle cx="194" cy="198" r="6" fill="#fff"/><circle cx="286" cy="198" r="6" fill="#fff"/><path d="M230 226Q240 220 250 226L240 237Z" fill="#576261"/></>;
    case "PENGUIN": return <><ellipse cx="240" cy="207" rx="67" ry="37" fill={c.light}/>{eyes(194,212,56)}<path d="M225 212H255L240 231Z" fill="#d4a056"/><path d="M154 416L191 411L207 434H144Z M326 416L289 411L273 434H336Z" fill="#d4a056"/></>;
    case "WHALE": return <><circle cx="347" cy="260" r="6" fill="#416777"/><path d="M345 288Q357 296 369 284" stroke="#416777" strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M200 137Q195 100 177 98M207 137Q213 100 232 99" stroke={c.shade} strokeWidth="9" fill="none" strokeLinecap="round"/><path d="M202 383Q218 416 247 389" fill={c.shade}/></>;
    case "MUSHROOM": return <><path d="M63 226C83 101 157 58 240 62C323 58 397 101 417 226Q240 272 63 226Z" fill="#c97f68" stroke="#aa6754" strokeWidth="3"/><g fill="#fff2db" opacity=".9"><ellipse cx="173" cy="130" rx="23" ry="17"/><ellipse cx="310" cy="169" rx="27" ry="21"/><ellipse cx="115" cy="202" rx="14" ry="10"/><ellipse cx="257" cy="93" rx="11" ry="7"/></g><path d="M86 225Q240 255 394 225" stroke="#f7ddbc" strokeWidth="8" fill="none"/></>;
    case "ACORN": return <><path d="M92 206Q87 109 240 103Q393 109 388 206Z" fill={paint("metal")} stroke={c.accent} strokeWidth="3"/><path d="M237 108Q226 62 252 58" stroke="#8a6940" strokeWidth="14" fill="none" strokeLinecap="round"/><g stroke="#704e33" strokeOpacity=".3" strokeWidth="2"><path d="M135 138L188 194M190 118L257 194M253 116L323 191M310 133L359 184M135 190L193 122M207 194L274 120M285 194L335 146"/></g></>;
    case "FLOWER": return <g fill="none" stroke={c.shade} strokeWidth="3" opacity=".7"><path d="M171 153L160 128M269 145L285 120M353 224L380 209M340 320L361 342M236 355L237 384M135 291L108 304" strokeLinecap="round"/><path d="M195 408Q172 428 159 405Q183 387 195 408Z" fill="#93b9a0" stroke="none"/></g>;
    default: return null;
  }
}
