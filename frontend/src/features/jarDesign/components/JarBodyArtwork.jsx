import { useEffect, useId, useRef } from "react";
import { getJarBody } from "../jarBodies.mjs";
import JarSlotOverlay from "./JarSlotOverlay";
import { photoFrameStyle } from "../photoFraming.mjs";
import { JAR_BODY_MOTIONS, observeJarMotion } from "../jarBodyMotion.mjs";
import "../jarBodyMotion.css";

/** 480 좌표의 저금통·사진 창·장식을 겹쳐 모든 화면에서 같은 완성 모습을 만든다. */
export default function JarBodyArtwork({ bodyStyle, imageUrl, photoFrame, imageRendering = "auto", className = "", alt = "선택한 저금통", onImageLoad, onImageError, showDefaultSlot = false, imageStyle }) {
  const id = useId().replace(/:/g, "");
  const motionRef = useRef(null);
  const body = getJarBody(bodyStyle);
  useEffect(() => observeJarMotion(motionRef.current), [bodyStyle]);
  if (!body) return null;
  const { colors: c, window: w } = body;
  const paint = (name) => `url(#${id}-${name})`;
  const frameStyle = photoFrameStyle(photoFrame, w);
  const motion = JAR_BODY_MOTIONS[body.id];
  return <div ref={motionRef} role="img" aria-label={alt} className={`jar-artwork relative aspect-square isolate ${className}`} data-jar-body={body.id} data-jar-motion={motion.kind}
    style={{ "--jar-motion-delay": `${motion.delay}s`, "--jar-motion-duration": `${motion.duration}s` }}>
    <svg aria-hidden="true" viewBox="0 0 480 480" className="pointer-events-none absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id={`${id}-body`} x1=".12" y1="0" x2=".85" y2="1"><stop stopColor={c.light}/><stop offset=".34" stopColor={c.base}/><stop offset=".7" stopColor={c.base}/><stop offset="1" stopColor={c.shade}/></linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2=".4"><stop stopColor={c.accent}/><stop offset=".3" stopColor="#f3deb3"/><stop offset=".52" stopColor={c.accent}/><stop offset="1" stopColor={c.shade}/></linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".5" y2="1"><stop stopColor="#fff"/><stop offset=".45" stopColor={c.light}/><stop offset="1" stopColor={c.shade}/></linearGradient>
        <radialGradient id={`${id}-shadow`}><stop stopColor="#344239" stopOpacity=".22"/><stop offset="1" stopColor="#344239" stopOpacity="0"/></radialGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".85"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
        <clipPath id={`${id}-body-clip`}><path d={body.path}/></clipPath>
        <pattern id={`${id}-grain`} width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill={c.shade} opacity=".16"/><path d="M8 9h2" stroke={c.light} strokeWidth="1" opacity=".4"/></pattern>
        <radialGradient id={`${id}-glow`} cx=".32" cy=".23" r=".8"><stop stopColor={c.light} stopOpacity=".55"/><stop offset=".65" stopColor={c.light} stopOpacity="0"/><stop offset="1" stopColor={c.shade} stopOpacity=".23"/></radialGradient>
        <mask id={`${id}-photo-safe`} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480"><rect width="480" height="480" fill="white"/><rect x={w.x-4} y={w.y-4} width={w.width+8} height={w.height+8} rx={w.radius+4} fill="black"/></mask>
        {/* 기존 고래 실루엣 좌표는 보존하고 꼬리만 별도 관절로 그려 이중 꼬리를 막는다. */}
        {body.id === "WHALE" && <mask id={`${id}-still-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480"><rect width="480" height="480" fill="white"/><rect x="383" y="216" width="97" height="122" fill="black"/></mask>}
      </defs>
      <ellipse cx="240" cy="441" rx="164" ry="23" fill={paint("shadow")}/>
      <Decorations body={body} paint={paint} layer="back"/>
      <g mask={body.id === "WHALE" ? paint("still-body") : undefined}>
      <path d={body.path} fill={c.shade} opacity=".18" transform="translate(0 7)"/>
      <path d={body.path} fill={paint("body")} stroke={c.shade} strokeWidth="3" strokeLinejoin="round"/>
      <g clipPath={paint("body-clip")}>
        <path d={body.path} fill={paint("glow")}/>
        <path d={body.path} fill={paint("grain")}/>
        <path className="jar-motion jar-glaze" d="M125 54Q81 247 126 444L151 444Q111 251 154 53Z" fill={paint("shine")} opacity=".38"/>
        <path d="M365 66Q404 269 352 425" fill="none" stroke={c.shade} strokeWidth="20" opacity=".15"/>
        <path d={body.path} transform="translate(240 245) scale(.965) translate(-240 -245)" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2"/>
      </g>
      </g>
      <rect x={w.x-9} y={w.y-5} width={w.width+18} height={w.height+18} rx={w.radius+9} fill={c.shade} opacity=".25"/>
      <rect x={w.x-7} y={w.y-7} width={w.width+14} height={w.height+14} rx={w.radius+7} fill={paint("rim")} stroke={c.accent} strokeOpacity=".85" strokeWidth="2"/>
      <rect x={w.x} y={w.y} width={w.width} height={w.height} rx={w.radius} fill="#fffdf8"/>
      {!imageUrl && <svg x={w.x+8} y={w.y+8} width={w.width-16} height={w.height-16} viewBox="0 0 160 160" aria-hidden="true"><WindowEmblem body={body}/></svg>}
    </svg>
    {imageUrl && <div className="absolute overflow-hidden" style={{ left:`${w.x/4.8}%`,top:`${w.y/4.8}%`,width:`${w.width/4.8}%`,height:`${w.height/4.8}%`,borderRadius:`${w.radius/w.width*100}% / ${w.radius/w.height*100}%`,background:"#fffdf8" }}>
      {/* HTML img를 사용해 만료 URL 재시도와 자연 크기 검증 콜백을 기존 흐름 그대로 유지한다. */}
      {/* 마스크 좌표는 480 정사각형 기준이다. 직사각형 사진 창에서도 img 자체는 정사각형으로 유지한다. */}
      {/* 저장된 배치가 있으면 창을 꽉 채운다. NULL인 기존 저금통은 예전 마스크/contain 표시를 유지한다. */}
      {/* V40의 CONTAIN 배치는 사진 전체와 모서리까지 창 안에 보존한다. 기본 COVER 공식은 그대로다. */}
      <img src={imageUrl} alt="" draggable={false} className={frameStyle ? "select-none" : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none object-contain"}
        style={frameStyle ? { ...frameStyle, imageRendering } : { ...imageStyle, imageRendering, width: `${Math.min(w.width,w.height)/w.width*100}%`, height: `${Math.min(w.width,w.height)/w.height*100}%` }} onLoad={onImageLoad} onError={onImageError}/>
    </div>}
    <svg aria-hidden="true" viewBox="0 0 480 480" className="pointer-events-none absolute inset-0 h-full w-full">
      <rect x={w.x} y={w.y} width={w.width} height={w.height} rx={w.radius} fill="none" stroke={c.shade} strokeOpacity=".4" strokeWidth="2"/>
      <path d={`M${w.x+18} ${w.y-3}H${w.x+w.width-18}`} stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
      {/* 어떤 장식을 추가해도 사용자의 그림 창은 가리지 않는다. 입구는 이 마스크 밖의 별도 오버레이다. */}
      <g mask={paint("photo-safe")} data-jar-photo-safe><Decorations body={body} paint={paint} layer="front"/><Atmosphere body={body}/></g>
    </svg>
    {showDefaultSlot && <JarSlotOverlay slot={body.slot}/>}
  </div>;
}

/** 작은 세공 요소는 같은 선 굵기를 재사용하되, 배치와 색은 오브제마다 다르게 정한다. */
function Spark({ x, y, size = 9, color = "#cfb16d" }) {
  return <g transform={`translate(${x} ${y}) scale(${size/10})`}><path className={`jar-motion jar-spark ${x > 300 ? "jar-motion-secondary" : y > 300 ? "jar-motion-tertiary" : ""}`} d="M0-10L2.7-2.7L10 0L2.7 2.7L0 10L-2.7 2.7L-10 0L-2.7-2.7Z" fill={color}/></g>;
}

function Sprig({ x, y, scale = 1, rotate = 0, color = "#d9c087" }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`} fill={color} stroke={color} strokeWidth="1.4">
    <g className="jar-motion jar-sprig"><path d="M0 0Q-8-30 0-65" fill="none"/>
    <path d="M-3-14Q-23-13-21-29Q-8-29-3-14M-4-32Q-21-34-17-46Q-5-45-4-32M-2-48Q-12-56-5-66Q4-60-2-48M-3-23Q15-20 16-38Q2-36-3-23M-3-42Q13-40 12-55Q0-53-3-42" stroke="none"/></g>
  </g>;
}

function Rosette({ x, y, size = 14, color = "#e4bac9", center = "#c9a366" }) {
  return <g transform={`translate(${x} ${y}) scale(${size/14})`}>
    <g className="jar-motion jar-rosette">
    {[0,60,120,180,240,300].map((angle) => <ellipse key={angle} cx="0" cy="-9" rx="5" ry="9" transform={`rotate(${angle})`} fill={color}/>)}
    <circle r="5" fill={center}/><circle cx="-1" cy="-1" r="1.5" fill="#fff7d9"/></g>
  </g>;
}

/** 사진 창 밖에만 보이는 작은 공기·빛 연출이다. 움직이는 장식도 같은 사진 보호 마스크를 사용한다. */
function Atmosphere({ body }) {
  const kind = JAR_BODY_MOTIONS[body.id].kind, color = body.colors.accent;
  if (body.id === "PERFUME") return <><Spark x={105} y={144} size={7} color={color}/><Spark x={366} y={111} size={9} color={color}/><Spark x={390} y={365} size={5} color={color}/></>;
  if (kind === "steam" || kind === "chimney") {
    const x = kind === "chimney" ? 331 : 82, y = kind === "chimney" ? 66 : 160;
    return <g fill="none" stroke={body.colors.shade} strokeWidth="2" strokeLinecap="round">
      <path className="jar-motion jar-steam" d={`M${x} ${y}q-9-9 0-19q9-9 0-19`}/>
      <path className="jar-motion jar-steam jar-motion-secondary" d={`M${x+13} ${y-4}q-7-8 0-16q7-9 0-16`}/>
    </g>;
  }
  if (kind === "bubble") return <g fill="none" stroke={body.colors.light} strokeWidth="2"><circle className="jar-motion jar-bubble" cx="174" cy="99" r="5"/><circle className="jar-motion jar-bubble jar-motion-secondary" cx="230" cy="86" r="3.5"/></g>;
  if (kind === "snow") return <g fill="#fffdf1"><circle className="jar-motion jar-snow" cx="132" cy="157" r="2.5"/><circle className="jar-motion jar-snow jar-motion-secondary" cx="351" cy="195" r="3"/><circle className="jar-motion jar-snow jar-motion-tertiary" cx="370" cy="282" r="2"/></g>;
  if (kind === "lantern") return <path className="jar-motion jar-lantern" d="M229 395C212 383 239 375 235 365C253 384 249 391 229 395Z" fill="#fff0b6"/>;
  return null;
}

/** 사진을 넣기 전에는 각 오브제의 이야기를 작은 판화로 보여준다. 실제 사진이 있으면 렌더링하지 않는다. */
function WindowEmblem({ body }) {
  const c = body.colors;
  let motif;
  switch (body.id) {
    case "CLASSIC": motif = <><Sprig x={73} y={121} scale={1.35} color={c.base}/><Sprig x={91} y={120} scale={.9} rotate={35} color={c.accent}/><path d="M60 123h42"/></>; break;
    case "BELLO": motif = <><path d="M35 98Q55 72 79 91T126 91M37 110Q60 83 83 103T126 104M44 121Q66 96 92 115T123 116"/><circle cx="91" cy="57" r="17" fill={c.base} stroke="none"/></>; break;
    case "APOTHECARY": motif = <><rect x="52" y="65" width="57" height="56" rx="9" fill={c.base} stroke="none"/><path d="M61 63V49h39v14M72 48h17"/><Sprig x={80} y={110} scale={.62} color="#f7efce"/><Sprig x={42} y={125} scale={.8} rotate={-22} color={c.base}/></>; break;
    case "MILK": motif = <><Rosette x={80} y={65} size={25} color={c.accent} center={c.base}/><path d="M80 88v37M80 104q-25-23-27-4q12 15 27 4M80 116q26-22 27-5q-13 14-27 5"/></>; break;
    case "FACET": motif = <><path d="M80 38L117 78L80 124L43 78Z" fill={c.base} stroke={c.accent}/><path d="M80 38L65 78L80 124L95 78ZM43 78h74" stroke="#f4fbef"/><Spark x={117} y={43} size={9} color={c.accent}/></>; break;
    case "PERFUME": motif = <><path d="M58 111V68h44v43ZM65 65V49h30v16M62 45h36"/><path d="M80 78l13 14-13 15-13-15Z" fill={c.base}/><path d="M40 87V58h9M120 87V58h-9"/><Spark x={80} y={31} size={7} color={c.accent}/></>; break;
    case "DOME": motif = <><path d="M46 113L69 62L90 113ZM80 113L103 46L126 113Z" fill={c.base} stroke="none"/><path d="M35 121q42-12 92 0"/><g fill={c.accent} stroke="none"><circle cx="40" cy="58" r="2"/><circle cx="82" cy="42" r="2"/><circle cx="117" cy="75" r="3"/></g><Spark x={66} y={34} size={8} color={c.accent}/></>; break;
    case "HEART": motif = <><path d="M36 68h88v54H36Z" fill={c.light}/><path d="M36 68l44 31 44-31M36 122l29-31m59 31-29-31"/><path d="M80 66C53 47 63 27 80 44C97 27 107 47 80 66Z" fill={c.base} stroke="none"/></>; break;
    case "STAR": motif = <><circle cx="80" cy="81" r="38"/><path d="M80 31l8 40 41 10-41 9-8 40-9-40-40-9 40-10Z" fill={c.base} stroke="none"/><path d="M80 47l5 29 25 5-25 5-5 27-5-27-27-5 27-5Z" fill={c.accent} stroke="none"/></>; break;
    case "MOON": motif = <><path d="M104 39C32 35 35 119 102 119C58 95 59 59 104 39Z" fill={c.base} stroke="none"/><Spark x={110} y={73} size={12} color={c.accent}/><Spark x={120} y={44} size={6} color={c.accent}/></>; break;
    case "CLOUD": motif = <><path d="M43 92C26 72 49 58 62 64C71 30 110 49 108 69C142 65 140 95 118 99H48Z" fill={c.base} stroke="none"/><path d="M59 109l-5 12m29-10-5 17m29-18-5 12" stroke={c.accent}/></>; break;
    case "SHELL": motif = <><path d="M80 119L37 71Q35 47 55 62Q54 29 72 49Q80 27 90 49Q108 30 108 62Q130 46 123 73Z" fill={c.light}/><path d="M80 116L56 64M80 116L74 51M80 116L90 51M80 116L108 64"/><circle cx="80" cy="112" r="9" fill={c.base} stroke="none"/></>; break;
    case "PEARL": motif = <><circle cx="80" cy="78" r="29" fill={c.light}/><path d="M57 72q4-18 20-19" stroke="#fff" strokeWidth="6"/><path d="M39 99q40 37 82-1M50 117q30 23 61 0"/><Spark x={119} y={42} size={10} color={c.accent}/></>; break;
    case "CRYSTAL": motif = <><path d="M80 31l27 31-9 49-18 21-20-21-9-49Z" fill={c.base} stroke={c.accent}/><path d="M80 31L70 66l10 66 11-66ZM51 62l19 4 21 0 16-4" stroke={c.light}/><Spark x={123} y={102} size={8} color={c.accent}/></>; break;
    case "PLANET": motif = <><circle cx="80" cy="80" r="29" fill={c.base} stroke="none"/><ellipse cx="80" cy="85" rx="60" ry="13" transform="rotate(-25 80 85)"/><Spark x={119} y={38} size={8} color={c.accent}/><circle cx="34" cy="47" r="3" fill={c.accent}/></>; break;
    case "ROCKET": motif = <><path d="M57 102V67Q59 42 80 26Q101 42 103 67v35Z" fill={c.base} stroke="none"/><circle cx="80" cy="67" r="12" fill={c.light}/><path d="M57 88L41 111h19M103 88l16 23h-19M69 110l11 24 11-24" fill={c.accent} stroke="none"/></>; break;
    case "HOUSE": motif = <><path d="M43 77L80 42l37 35v49H43Z" fill={c.light}/><path d="M34 79l46-43 46 43" stroke={c.base} strokeWidth="8"/><path d="M71 126V91h19v35M51 88h11v14H51m48-14h11v14H99"/><Sprig x={36} y={128} scale={.65} color={c.base}/></>; break;
    case "CASTLE": motif = <><path d="M42 122V63h23v23h30V63h23v59ZM66 86V49h28v37" fill={c.light}/><path d="M35 63l18-23 19 23M61 49l19-25 20 25M89 63l18-23 18 23" fill={c.base} stroke="none"/><path d="M74 123V99q6-12 12 0v24"/></>; break;
    case "TEAPOT": motif = <><path d="M51 74h47q20 12 13 34q-10 27-38 22q-23-3-28-27L30 73l15 5 12 15" fill={c.base} stroke="none"/><path d="M110 83q34-7 24 24q-7 11-22 9M59 67h35M66 55q10-9 20 0"/><Rosette x={78} y={97} color={c.light} center={c.accent}/></>; break;
    case "LANTERN": motif = <><path d="M62 54V37q18-23 36 0v17M56 61h48l9 63H47Z"/><path d="M45 126h71M52 55h56" strokeWidth="7"/><path d="M80 107C54 91 85 72 81 61C105 90 101 102 80 107Z" fill={c.base} stroke="none"/></>; break;
    case "PIG": motif = <><path d="M80 122C42 87 36 49 59 47q12-1 21 15q9-16 21-15C126 49 118 88 80 122Z" fill={c.base} stroke="none"/><path d="M66 30l7 10 7-18 7 18 7-10-3 20H69Z" fill={c.accent} stroke="none"/></>; break;
    case "CAT": motif = <><path d="M109 42C64 23 45 82 76 107q12 10 30 5C64 94 72 64 109 42Z" fill={c.base} stroke="none"/><Spark x={112} y={82} size={14} color={c.accent}/><path d="M38 74l-5 23 13 18"/><g fill={c.accent}><circle cx="38" cy="74" r="3"/><circle cx="33" cy="97" r="3"/><circle cx="46" cy="115" r="3"/></g></>; break;
    case "BEAR": motif = <><path d="M38 54h84v62H38Z" fill={c.light}/><path d="M80 54v62M39 83h82" stroke={c.base} strokeWidth="10"/><path d="M80 54C40 61 49 25 68 38L80 54C120 61 111 25 92 38Z" fill={c.base} stroke="none"/><path d="M65 121l15 9 15-9"/></>; break;
    case "RABBIT": motif = <><path d="M78 125C30 112 35 47 89 43C61 58 59 110 104 116Z" fill={c.base} stroke="none"/><Rosette x={104} y={61} size={17} color={c.light} center={c.accent}/><Spark x={119} y={93} size={9} color={c.accent}/></>; break;
    case "PANDA": motif = <><path d="M74 127V37m20 90V51M67 55h15M67 80h15M67 106h15M87 75h15M87 100h15" stroke={c.accent} strokeWidth="5"/><path d="M74 62Q39 60 44 42q27 1 30 20M94 87q36-23 36-3q-16 11-36 3" fill={c.accent} stroke="none"/></>; break;
    case "PENGUIN": motif = <><path d="M80 35v90M41 57l78 46M41 103l78-46M69 43l11 12 11-12M69 117l11-12 11 12M43 71l17-1-1-17M101 106l-1-17 17 1M59 107l1-18-17 1M101 54l-1 17 17-1" stroke={c.base} strokeWidth="4"/></>; break;
    case "WHALE": motif = <><path d="M34 93Q49 48 89 68q18 8 21 25l18-14-6 23q-24 31-57 17q-20-6-31-26Z" fill={c.base} stroke="none"/><path d="M34 132q20-10 40 0t50 0"/><circle cx="96" cy="86" r="3" fill={c.light} stroke="none"/><Spark x={67} y={44} size={9} color={c.accent}/></>; break;
    case "MUSHROOM": motif = <><path d="M62 80h36v43H62Z" fill={c.light}/><path d="M35 83Q39 32 80 35q41-3 45 48Z" fill={c.accent} stroke="none"/><g fill={c.light} stroke="none"><circle cx="64" cy="61" r="7"/><circle cx="98" cy="70" r="9"/></g><path d="M73 123v-18q7-13 14 0v18"/><Sprig x={42} y={126} scale={.6} color={c.base}/></>; break;
    case "ACORN": motif = <><path d="M52 71h57q5 43-28 59Q48 114 52 71Z" fill={c.base} stroke="none"/><path d="M47 73q0-40 33-40q34 0 35 40Z" fill={c.accent} stroke="none"/><path d="M78 32q-5-13 7-19"/><Sprig x={128} y={113} scale={.6} rotate={28} color={c.base}/></>; break;
    case "FLOWER": motif = <><Rosette x={80} y={72} size={33} color={c.base} center={c.accent}/><path d="M80 109v24M80 130q-30-23-28-1q13 13 28 1M80 128q30-23 29-5q-9 12-29 5" fill="#8fa18a" stroke="none"/></>; break;
    default: motif = null;
  }
  return <g fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="80" cy="80" r="67" fill={body.stage.light} stroke="none"/>
    <circle cx="80" cy="80" r="62" strokeOpacity=".28" strokeDasharray="1 6"/>
    {motif}
  </g>;
}

/** 본체별 뚜껑·귀·고리·받침을 별도 도형으로 그려 실루엣과 재질을 구분한다. */
function Decorations({ body, paint, layer }) {
  const { id, colors:c } = body;
  if (layer === "back") {
    if (id === "TEAPOT") return <ellipse cx="354" cy="253" rx="49" ry="68" fill="none" stroke={c.shade} strokeWidth="23"/>;
    if (id === "LANTERN") return <path d="M197 112V75Q240 15 283 75V112" fill="none" stroke={c.accent} strokeWidth="12"/>;
    if (id === "PLANET") return <ellipse cx="240" cy="267" rx="217" ry="53" transform="rotate(-24 240 267)" fill="none" stroke={c.accent} strokeWidth="14"/>;
    // 뿌리는 몸통 뒤에 숨기고 관절 위치를 고정해 사진 창·입구에 영향을 주지 않는다.
    if (id === "CAT") return <g className="jar-motion jar-tail" style={{transformOrigin:"369px 378px"}}><path d="M369 378C426 391 443 351 421 323C402 298 397 283 411 268" fill="none" stroke={c.shade} strokeWidth="20" strokeLinecap="round"/><path d="M370 375C424 387 438 351 419 325C401 301 397 283 411 268" fill="none" stroke={paint("body")} strokeWidth="13" strokeLinecap="round"/><path d="M411 315l14-7m-19-9 12-7" stroke={c.accent} strokeWidth="3"/></g>;
    if (id === "PIG") return <g className="jar-motion jar-curly-tail" style={{transformOrigin:"390px 282px"}}><path d="M390 282C435 296 446 259 421 257C402 254 402 278 420 275" fill="none" stroke={c.shade} strokeWidth="8" strokeLinecap="round"/></g>;
    if (id === "BEAR" || id === "RABBIT") return <g className="jar-motion jar-pom-tail" style={{transformOrigin:"365px 364px"}}><circle cx="368" cy="363" r={id === "RABBIT" ? 22 : 15} fill={paint("body")} stroke={c.shade} strokeWidth="2"/><path d="M371 350q10 4 10 13" fill="none" stroke={c.light} strokeWidth="3" strokeLinecap="round"/></g>;
    if (id === "WHALE") return <g className="jar-motion jar-fin" style={{transformOrigin:"379px 290px"}}><path d="M376 273Q411 216 448 229L427 280L464 304Q425 335 381 309L369 295Z" fill={paint("body")} stroke={c.shade} strokeWidth="3" strokeLinejoin="round"/><path d="M394 270l38-27m-35 59 43 5" stroke={c.light} strokeWidth="2" fill="none"/></g>;
    return null;
  }
  const cap = (x,y,w,h,r=10) => <g><rect x={x} y={y} width={w} height={h} rx={r} fill={paint("metal")} stroke={c.accent} strokeWidth="2"/><path d={`M${x+8} ${y+7}H${x+w-8}`} stroke="#fff7df" strokeOpacity=".75" strokeWidth="3" strokeLinecap="round"/></g>;
  const eyes = (y, x=205, gap=70, color="#45403d") => <g fill={color}><g className="jar-motion jar-eye"><ellipse cx={x} cy={y} rx="5" ry="7"/><circle cx={x-1} cy={y-2} r="1.6" fill="#fff"/></g><g className="jar-motion jar-eye"><ellipse cx={x+gap} cy={y} rx="5" ry="7"/><circle cx={x+gap-1} cy={y-2} r="1.6" fill="#fff"/></g></g>;
  const rivets = (points) => <g fill={c.light} stroke={c.accent} strokeWidth="1.5">{points.map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5"/>)}</g>;
  switch(id) {
    case "CLASSIC": return <>
      {cap(145,99,190,49)}<path d="M149 140h182M155 153h170M159 161h162" stroke={c.accent} strokeWidth="3"/>
      {Array.from({length:14}, (_,i) => <path key={i} d={`M${158+i*12} 110v27`} stroke={c.shade} strokeOpacity=".45" strokeWidth="2"/>)}
      <Sprig x={116} y={338} scale={1.2} rotate={-8} color={c.light}/><Sprig x={366} y={338} scale={1.2} rotate={8} color={c.accent}/>
      <path d="M146 398q94 27 188 0M178 410h124" stroke={c.accent} strokeWidth="2" fill="none"/>
    </>;
    case "BELLO": return <>
      <ellipse cx="240" cy="107" rx="47" ry="12" fill={paint("rim")}/><ellipse cx="240" cy="105" rx="31" ry="5" fill={c.shade} opacity=".4"/>
      <g fill="none" stroke={c.accent} strokeWidth="2.5"><path d="M101 279q-6-56 19-81M360 201q31 58 18 112M150 399q90 44 180 0M170 412q70 22 140 0"/>
      <path d="M148 175q26-12 41 0t36 0m-67-11q23-9 40 0" opacity=".7"/></g>
      <Rosette x={359} y={348} size={12} color={c.light} center={c.accent}/>
    </>;
    case "APOTHECARY": return <>
      <rect x="184" y="56" width="112" height="54" rx="6" fill="#c5a17a" stroke="#896846" strokeWidth="3"/>
      <path d="M195 67l17 5m-6 19 16-4m12-19 13 7m9 24 21-7m-48-5 8 1m22-20 22 6" stroke="#896846" strokeOpacity=".45" strokeWidth="2"/>
      <path d="M182 114h116m-118 6h120M156 197h168M150 402h180" stroke={c.accent} strokeWidth="3"/>
      <Sprig x={143} y={340} scale={1} rotate={-4} color={c.light}/><Sprig x={337} y={340} scale={1} rotate={4} color={c.accent}/>
      <path d="M204 143q36 14 72 0l-6 41h-60Z" fill="#e9ddbf" stroke={c.accent} strokeWidth="2"/>
      <path d="M220 155h40m-32 8h24m-19 8h14" stroke={c.shade} strokeWidth="2"/>
    </>;
    case "MILK": return <>
      {cap(185,60,110,31,9)}<path d="M184 101h112M178 147h124M152 400q88 29 176 0" stroke={c.accent} strokeWidth="5" fill="none"/>
      <path d="M196 117q10 12 20 0t20 0t20 0t20 0M165 414q75 16 150 0" stroke={c.accent} strokeWidth="2" fill="none"/>
      <Rosette x={239} y={173} size={13} color={c.accent} center={c.light}/>
      <Sprig x={151} y={337} scale={.8} color={c.accent}/><Sprig x={329} y={337} scale={.8} rotate={12} color={c.accent}/>
      {rivets([[206,76],[274,76]])}
    </>;
    case "FACET": return <>
      <g fill={c.light} opacity=".32"><path d="M167 114L139 191L107 178v179l32 7 24 55Z"/><path d="M313 114l28 77 32-13Z"/><path d="M317 419l24-55 32-7Z"/></g>
      <g fill="none" stroke={c.shade} strokeWidth="3"><path d="M167 114L139 191L107 178M313 114L341 191L373 178M107 357L139 364L163 419M373 357L341 364L317 419M107 178l22 7v165l-22 7m266-179-22 7v165l22 7" opacity=".7"/>
      <path d="M170 405h140M169 119h142" stroke={c.accent} strokeWidth="4"/></g>
      {rivets([[118,196],[362,196],[118,340],[362,340]])}<Spark x={326} y={168} size={10} color="#fff5d9"/>
    </>;
    case "PERFUME": return <>
      <path d="M179 101V71l22-24h78l22 24v30Z" fill={paint("body")} stroke={c.accent} strokeWidth="3"/>
      <path d="M201 47l12 24-8 30m74-54-12 24 8 30M182 71h116" fill="none" stroke={c.light} strokeWidth="2"/>
      {cap(192,106,96,15,4)}
      <g fill="none" stroke={c.accent} strokeWidth="3"><path d="M125 189V172h47M355 189v-17h-47M125 366v25h37m193-25v25h-37M172 166h136M185 399h110"/>
      <path d="M130 203v130m220-130v130" strokeWidth="1.5"/></g>
      <path d="M240 393l8 8-8 8-8-8Z" fill={paint("metal")}/><Rosette x={240} y={209} size={9} color={c.accent} center={c.light}/>
    </>;
    case "DOME": return <>
      <rect x="81" y="357" width="318" height="49" rx="12" fill="#896c51" stroke="#66533f" strokeWidth="3"/>
      <g stroke="#c7a87e" fill="none" strokeWidth="2"><path d="M95 369q70 8 136 0t154 0M95 389q58-12 118-2t172 0M96 399q125-8 288 0"/><path d="M126 377h27m175 0h25"/></g>
      <rect x="106" y="407" width="268" height="16" rx="7" fill={c.accent}/>
      <path d="M115 208Q124 124 192 110" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".7"/>
      <Spark x={330} y={167} color="#fff8da"/><Spark x={113} y={303} size={5} color="#fff"/>
      <g fill="#fff" opacity=".75"><circle cx="154" cy="135" r="3"/><circle cx="307" cy="122" r="3"/><circle cx="368" cy="267" r="3"/><circle cx="115" cy="238" r="2"/></g>
      <path d="M228 378h24l-12 13Z" fill={paint("metal")}/>
    </>;
    case "HEART": return <>
      <path d="M99 169C102 113 158 104 184 126" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" opacity=".6"/>
      <path d="M88 230q28 80 122 162m182-162q-28 80-122 162" stroke={c.accent} strokeWidth="3" strokeDasharray="1 9" fill="none"/>
      <path d="M239 116C205 105 193 75 218 78l22 23 22-23c25-3 13 27-21 38Z" fill={c.accent} stroke="#f6d7ab" strokeWidth="2"/>
      <path d="M226 116l-20 31 20-7 8-24m20 0 20 31-20-7-8-24" fill={c.accent}/>
      <path className="jar-motion jar-heart" d="M229 380q11-17 22 0l-11 16Z" fill={paint("metal")}/><Rosette x={371} y={170} size={12} color={c.light} center={c.accent}/>
    </>;
    case "STAR": return <>
      <g fill={c.light} opacity=".45"><path d="M240 69v103l-48-14ZM87 182l69 80 18-63ZM327 269l17 90-47-49Z"/></g>
      <g fill="none" stroke={c.accent} strokeWidth="2"><path d="M240 78v82M97 186l61 67M144 352l25-73M336 352l-25-73M380 184l-61 67"/>
      <path d="M181 173l-32 18-26 7m176-25 32 18 26 7M174 332l34-6m98 6-34-6" strokeDasharray="2 6"/></g>
      {rivets([[127,205],[353,205],[165,326],[315,326]])}<Spark x={239} y={102} size={11} color="#fff5d9"/>
    </>;
    case "MOON": return <>
      <path d="M245 91C157 99 99 172 101 263M129 341q70 73 154 44" fill="none" stroke={c.accent} strokeWidth="3"/>
      <path d="M225 108q-106 36-109 115" fill="none" stroke="#fff8da" strokeWidth="6" strokeLinecap="round" opacity=".6"/>
      <g fill={c.shade} opacity=".24"><circle cx="130" cy="355" r="13"/><circle cx="183" cy="382" r="7"/><circle cx="113" cy="178" r="6"/></g>
      <path d="M289 126v49m57 52v37m-45-91 45 54" stroke={c.accent} strokeWidth="1.5" strokeDasharray="2 5"/>
      <Spark x={289} y={183} size={15} color={c.accent}/><Spark x={347} y={277} size={12} color={c.accent}/><Spark x={227} y={371} size={10} color={c.accent}/>
      <circle cx="317" cy="208" r="4" fill={c.accent}/>
    </>;
    case "CLOUD": return <>
      <g fill="none" strokeLinecap="round"><path d="M153 166Q132 141 110 155M226 121Q256 92 281 115M358 181q24-8 40 14" stroke="#fff" strokeWidth="7" opacity=".6"/>
      <path d="M114 352q118 25 252 0" stroke={c.accent} strokeWidth="2" strokeDasharray="1 7"/>
      <path d="M143 375v34m55-32v45m87-47v29m53-33v39" stroke={c.accent} strokeWidth="2"/></g>
      <g fill={paint("metal")}><path className="jar-motion jar-rain" d="M143 403q-16 20 0 23q16-3 0-23Z"/><path className="jar-motion jar-rain jar-motion-secondary" d="M285 397q-13 16 0 20q13-4 0-20Z"/></g>
      <Spark x={198} y={427} size={12} color={c.accent}/><Spark x={338} y={417} size={8} color={c.accent}/>
    </>;
    case "SHELL": return <>
      <g fill={c.light} opacity=".4"><path d="M202 112l-26 13 23 76 12 4ZM286 112l27 12-25 80-16 0ZM123 157l-16 20 25 35 21-2ZM363 157l15 20-28 35-21-2Z"/></g>
      <g fill="none" stroke={c.accent} strokeWidth="2.5"><path d="M123 157L152 210M202 112L210 203M286 112L274 203M363 157L328 210M74 259L134 296M406 259L346 296M92 217l35 19m261-19-35 19"/>
      <path d="M162 410Q240 439 318 410" strokeWidth="7"/><path d="M173 394q67 27 134 0" strokeDasharray="1 7"/></g>
      <circle cx="240" cy="400" r="15" fill={paint("rim")} stroke={c.accent} strokeWidth="2"/><circle cx="235" cy="395" r="4" fill="#fff"/>
    </>;
    case "PEARL": return <>
      <path d="M111 187Q122 126 181 109" stroke="#fff" strokeWidth="12" fill="none" strokeLinecap="round" opacity=".7"/>
      <path d="M103 308q12 53 54 79m220-79q-12 53-54 79" fill="none" stroke={c.accent} strokeWidth="2" strokeDasharray="1 9"/>
      <path d="M147 382q12 36 57 35h72q45-1 57-35l-29 10-18 13h-92l-18-13Z" fill={paint("metal")} stroke={c.accent} strokeWidth="2"/>
      {cap(177,417,126,12,5)}<Spark x={365} y={184} size={12} color="#fff5da"/><Spark x={337} y={330} size={6} color={c.accent}/>
      <path d="M343 119q33 24 40 62" fill="none" stroke="#eed5e7" strokeWidth="9" opacity=".65"/>
    </>;
    case "CRYSTAL": return <>
      <g fill={c.light} opacity=".35"><path d="M181 67l59 55-82 74-61-21ZM299 67l84 108-61 21-82-74ZM138 380l20-16 82 65ZM342 380l-20-16-82 65Z"/></g>
      <g fill="none" stroke={c.shade} strokeWidth="3"><path d="M181 67L158 196L97 175M299 67L322 196L383 175M138 380L158 364L240 429L322 364L342 380M181 67L240 122L299 67"/>
      <path d="M110 181l38 185 92 49 92-49 38-185M179 79l-69 91" stroke={c.accent} strokeWidth="2"/></g>
      <path d="M183 82l-64 87" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".6"/>
      <Spark x={336} y={178} size={12} color="#fff1c6"/>{rivets([[148,370],[332,370],[240,123]])}
    </>;
    case "PLANET": return <>
      <g fill="none" stroke={c.light} strokeWidth="4" opacity=".65"><path d="M144 151q85-37 176 3M102 209q94-43 274-9M112 312q100 38 253-6M149 357q75 24 175-1"/></g>
      <path d="M53 330C126 369 383 246 425 191" stroke={paint("metal")} strokeWidth="13" fill="none"/>
      <path d="M55 326C126 361 381 242 420 193" stroke="#f4deb3" strokeWidth="2" fill="none"/>
      <g className="jar-motion jar-orbit"><circle cx="374" cy="102" r="13" fill={c.accent}/><ellipse cx="374" cy="102" rx="23" ry="5" transform="rotate(-25 374 102)" fill="none" stroke={c.accent} strokeWidth="2"/></g>
      <Spark x={88} y={143} size={9} color={c.accent}/><Spark x={392} y={362} size={7} color={c.accent}/>
      <circle cx="74" cy="377" r="3" fill={c.accent}/>
    </>;
    case "ROCKET": return <>
      <path d="M195 116L240 63L285 116Z" fill={c.accent} stroke={c.shade} strokeWidth="2"/><path d="M214 109l26-33 13 16" fill="none" stroke="#f4dfb7" strokeWidth="3"/>
      <path d="M123 320L161 286L156 360Z M357 320L319 286L324 360Z" fill={c.accent} stroke={c.shade} strokeWidth="2"/>
      <g className="jar-motion jar-flame"><path d="M210 401L225 440L240 414L254 440L271 401" fill="#e9bb67"/><path d="M224 402l16 24 16-24" fill="#fff1b2"/></g>
      <path d="M183 369h114v24H183Z" fill={c.shade}/><path d="M193 373v14m23-14v14m48-14v14m23-14v14" stroke={c.accent} strokeWidth="9"/>
      {rivets([[178,181],[302,181],[177,328],[303,328]])}
      <path d="M218 346h44m-32 7h20" stroke={c.accent} strokeWidth="3" strokeLinecap="round"/>
    </>;
    case "HOUSE": return <>
      <path d="M315 127V79H348V156" fill={c.accent} stroke={c.shade} strokeWidth="3"/>
      <path d="M77 209L240 65L403 209L387 230L240 103L93 230Z" fill={c.accent} stroke={c.shade} strokeWidth="2"/>
      <g fill="none" stroke="#f0b195" strokeWidth="2"><path d="M105 201l135-116 135 116M127 192l15 4m8-29 16 3m10-29 15 3m10-29 15 3m35-3 14 14m9 11 14 14m9 11 14 14m9 11 14 14"/></g>
      <circle cx="240" cy="156" r="17" fill={c.shade} stroke={c.accent} strokeWidth="3"/>
      <path d="M225 156h30m-15-15v30M115 402h250" stroke={c.light} strokeWidth="3"/>
      <Sprig x={119} y={359} scale={1.25} rotate={-8} color="#648c66"/><Sprig x={361} y={326} scale={1.05} rotate={8} color="#648c66"/>
      <Rosette x={115} y={335} size={9} color="#dfaaa2"/><path d="M137 414h206" stroke={c.accent} strokeWidth="4"/>
    </>;
    case "CASTLE": return <>
      <g fill={c.accent} stroke={c.shade} strokeWidth="2"><path d="M60 180L114 97L169 180Z"/><path d="M175 138L240 55L305 138Z M311 180L366 97L420 180Z"/></g>
      <g fill={c.light} opacity=".24"><path d="M66 175l48-71v71ZM181 132l59-69v69ZM318 175l48-71v71Z"/></g>
      <path d="M80 164h68m-57-18h44m-36-17h26M195 122h90m-74-19h59m-44-18h28M332 164h66m-55-18h45m-35-17h25" stroke={c.light} strokeOpacity=".4" strokeWidth="1.5"/>
      <path d="M240 55V28" fill="none" stroke={c.accent} strokeWidth="2"/><path className="jar-motion jar-flag" d="M240 28L272 37L240 45Z" fill="#bd9859" stroke={c.accent} strokeWidth="2"/>
      <path d="M81 164h65m53-44h82m53 44h65M80 271h69m182 0h69M80 353h69m182 0h69M103 251v20m19 0v39m-19 0v43m255-102v20m19 0v39m-19 0v43" fill="none" stroke={c.shade} strokeWidth="2" opacity=".6"/>
      <g fill="#e4c489" stroke={c.shade} strokeWidth="2"><path d="M104 243v-28q11-18 22 0v28ZM354 243v-28q11-18 22 0v28ZM225 203v-34q15-23 30 0v34Z"/></g>
      <path d="M115 211v29m250-29v29m-125-79v38m-12-18h24" stroke={c.accent} strokeWidth="2"/>
      <path d="M91 390h35v26l-17-9-18 9ZM354 390h35v26l-17-9-18 9Z" fill={c.accent}/><Spark x={240} y={230} size={9} color="#d3b675"/>
    </>;
    case "TEAPOT": return <>
      {cap(164,139,133,24,12)}<ellipse cx="230" cy="129" rx="21" ry="14" fill={paint("metal")}/>
      <path d="M64 219L92 283M354 202Q403 218 382 288" stroke={c.light} strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M133 365q87 59 190-3M168 165h123M153 397q66 23 141 0" stroke={c.accent} strokeWidth="2" fill="none"/>
      <Sprig x={125} y={338} scale={.9} rotate={-22} color={c.light}/><Sprig x={331} y={320} scale={.8} rotate={22} color={c.accent}/>
      <Rosette x={125} y={293} size={14} color="#e2bbc2"/><Rosette x={335} y={343} size={12} color={c.light}/>
      <path d="M180 388q13-16 26 0t26 0t26 0t26 0" stroke={c.light} strokeWidth="2" fill="none"/>
    </>;
    case "LANTERN": return <>
      {cap(132,124,216,39,6)}<path d="M151 124L192 87H288L329 124Z" fill={c.accent} stroke={c.shade} strokeWidth="2"/>
      <path d="M194 98h91m-121 80-18 185m170-185 18 185" stroke={c.light} strokeWidth="2" fill="none"/>
      <path d="M143 184L126 363M337 184L354 363" stroke={c.accent} strokeWidth="11"/>
      <path d="M174 357q63 20 132 0" stroke="#ffda8e" strokeWidth="6" fill="none"/>
      {cap(112,374,256,35,7)}<path d="M137 384h205m-186 17h167" stroke={c.light} strokeWidth="2" opacity=".6"/>
      {rivets([[143,142],[337,142],[129,392],[351,392]])}<Spark x={360} y={253} size={9} color="#e7c885"/>
      <path d="M213 93l7-15h40l7 15" fill="none" stroke={c.accent} strokeWidth="3"/>
    </>;
    case "PIG": return <>
      <path d="M144 105L175 128L149 145Z M336 105L305 128L331 145Z" fill={c.shade}/>{eyes(187,185,110)}
      <ellipse cx="240" cy="213" rx="28" ry="19" fill={c.shade} opacity=".65"/>
      <g fill="#915d6c"><ellipse cx="230" cy="213" rx="3" ry="5"/><ellipse cx="250" cy="213" rx="3" ry="5"/></g>
      <g fill="#f39191" opacity=".65"><ellipse cx="154" cy="219" rx="17" ry="10"/><ellipse cx="326" cy="219" rx="17" ry="10"/></g>
      <path d="M204 98l-5-34 20 13 21-27 21 27 20-13-5 34Z" fill={paint("metal")} stroke={c.accent} strokeWidth="2"/>
      <circle cx="240" cy="79" r="5" fill={c.base}/><path d="M165 409v13m18-13v13m114-13v13m18-13v13" stroke={c.shade} strokeWidth="2.5"/>
      <Spark x={368} y={313} size={10} color={c.accent}/><Spark x={110} y={288} size={7} color={c.accent}/>
    </>;
    case "CAT": return <>
      <path d="M137 85L172 121L147 159Z M343 85L308 121L333 159Z" fill="#c19999"/>{eyes(197,205,70,"#e9c783")}
      <path d="M232 214L240 220L248 214M240 221Q225 234 214 221M240 221Q255 234 266 221M151 210L183 215m-30 6 30 0M329 210L297 215m30 6-30 0" fill="none" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M133 240q102 34 213 0M141 397q91 30 198 0" fill="none" stroke={c.accent} strokeWidth="3"/>
      <path d="M248 239q-22-7-27 12q-4 16 19 16q-15-12 8-28Z" fill={paint("metal")}/>
      <path d="M122 304l5 31 8 29m216-61-4 34-15 22" fill="none" stroke={c.accent} strokeWidth="1.5"/>
      <Spark x={122} y={304} size={8} color={c.accent}/><Spark x={135} y={364} size={5} color={c.accent}/><Spark x={350} y={303} size={7} color={c.accent}/>
      <path d="M193 410v8m16-7v9m62-9v9m16-10v8" stroke={c.accent} strokeWidth="2"/>
    </>;
    case "BEAR": return <>
      <circle cx="152" cy="90" r="19" fill={c.shade} opacity=".6"/><circle cx="334" cy="94" r="19" fill={c.shade} opacity=".6"/>{eyes(190)}
      <ellipse cx="240" cy="218" rx="35" ry="22" fill={c.light}/><path d="M230 209Q240 202 250 209L240 219Z" fill="#72503c"/>
      <path d="M240 219v7m-13 0q13 10 26 0" fill="none" stroke="#72503c" strokeWidth="2" strokeLinecap="round"/>
      <path d="M133 243q107 26 214 0l-3 19q-100 28-208 0Z" fill="#966351"/>
      <path d="M143 251q92 23 194 0" fill="none" stroke="#f2d0a2" strokeWidth="3" strokeDasharray="9 6"/>
      <path d="M330 260l-8 48 21 1 11-56Z" fill="#966351"/><path d="M328 279h18m-20 13h17" stroke="#f2d0a2" strokeWidth="3"/>
      <path d="M122 298q-9 43 13 75m219-75q9 43-13 75M173 404q21 12 42 0m50 0q21 12 42 0" stroke={c.shade} strokeWidth="3" fill="none"/>
      <path d="M240 394v23" stroke={c.shade} strokeWidth="2" strokeDasharray="2 4"/>
    </>;
    case "RABBIT": return <>
      <g className="jar-motion jar-ear" style={{transformOrigin:"191px 143px"}}><path d="M178 59Q168 93 191 143" fill="none" stroke="#e7bacf" strokeWidth="13" strokeLinecap="round"/><path d="M179 65q-2 31 9 55" stroke="#fff2ec" strokeWidth="3" fill="none"/></g>
      <g className="jar-motion jar-ear jar-motion-secondary" style={{transformOrigin:"289px 143px"}}><path d="M302 59Q312 93 289 143" fill="none" stroke="#e7bacf" strokeWidth="13" strokeLinecap="round"/><path d="M301 65q2 31-9 55" stroke="#fff2ec" strokeWidth="3" fill="none"/></g>{eyes(222,208,64)}
      <path d="M234 240L240 246L246 240" fill="#ae718f"/><path d="M240 246v5m-9 0q9 7 18 0" fill="none" stroke="#ae718f" strokeWidth="2"/>
      <ellipse cx="183" cy="245" rx="12" ry="7" fill="#e5adc4"/><ellipse cx="297" cy="245" rx="12" ry="7" fill="#e5adc4"/>
      <path d="M327 173q-21-33-33-16q-7 14 17 26q-33-5-30 14q5 18 32-4Z" fill={c.shade} stroke={c.light} strokeWidth="2"/>
      <circle cx="317" cy="181" r="8" fill={paint("metal")}/><path d="M319 185l22 32-22-5-4-18" fill={c.shade}/>
      <path d="M164 400q29 17 62 9m28 0q32 8 62-9" fill="none" stroke={c.accent} strokeWidth="2"/>
      <Spark x={130} y={310} size={9} color={c.accent}/><Spark x={348} y={328} size={6} color={c.accent}/>
    </>;
    case "PANDA": return <>
      <circle cx="138" cy="100" r="25" fill="#384744"/><circle cx="344" cy="100" r="25" fill="#384744"/>
      <ellipse cx="193" cy="202" rx="23" ry="29" transform="rotate(25 193 202)" fill="#384744"/><ellipse cx="287" cy="202" rx="23" ry="29" transform="rotate(-25 287 202)" fill="#384744"/>
      <circle className="jar-motion jar-eye" cx="194" cy="198" r="6" fill="#fff9e8"/><circle className="jar-motion jar-eye" cx="286" cy="198" r="6" fill="#fff9e8"/>
      <path d="M230 226Q240 220 250 226L240 237Z" fill="#384744"/><path d="M240 237v7m-10 0q10 6 20 0" fill="none" stroke="#384744" strokeWidth="2"/>
      <path d="M131 248q109 25 218 0l-4 17q-105 25-210 0Z" fill={c.accent}/>
      <g className="jar-motion jar-scarf" style={{transformOrigin:"337px 261px"}}><path d="M323 260l-8 47 22 2 10-52Z" fill={c.accent}/><path d="M319 281h21m-23 12h19" fill="none" stroke="#c8d4ad" strokeWidth="2"/></g>
      <path d="M137 255q102 23 205 0" fill="none" stroke="#c8d4ad" strokeWidth="2"/>
      <Sprig x={123} y={365} scale={.95} color={c.accent}/><path d="M159 409h35m92 0h35" stroke="#384744" strokeWidth="13" strokeLinecap="round"/>
    </>;
    case "PENGUIN": return <>
      <ellipse cx="240" cy="207" rx="67" ry="37" fill="#f3e9d3"/>{eyes(194,212,56)}<path d="M225 212H255L240 231Z" fill={c.accent}/>
      <path d="M163 243q77 22 154 0l-1 20q-76 24-152 0Z" fill={c.accent}/><path d="M171 252q68 20 137 0" fill="none" stroke="#f5d4a9" strokeWidth="2" strokeDasharray="3 5"/>
      <g className="jar-motion jar-scarf" style={{transformOrigin:"318px 259px"}}><path d="M304 259l-4 46 23 4 7-55Z" fill={c.accent}/><path d="M304 277l21 3m-22 11 20 3" stroke="#f5d4a9" strokeWidth="3"/></g>
      <path d="M154 416L191 411L207 434H144Z M326 416L289 411L273 434H336Z" fill={c.accent} stroke={c.shade} strokeWidth="2"/>
      <path className="jar-motion jar-flipper" style={{transformOrigin:"124px 296px"}} d="M124 296l11 29" stroke={c.light} strokeWidth="4" strokeLinecap="round"/><path className="jar-motion jar-flipper jar-motion-secondary" style={{transformOrigin:"355px 296px"}} d="M355 296l-11 29" stroke={c.light} strokeWidth="4" strokeLinecap="round"/>
      <Spark x={170} y={163} size={6} color="#dfe8f2"/><Spark x={318} y={340} size={9} color="#dfe8f2"/>
    </>;
    case "WHALE": return <>
      <g className="jar-motion jar-eye"><circle cx="347" cy="260" r="6" fill="#243f55"/><circle cx="345" cy="258" r="1.8" fill="#fff4d4"/></g>
      <path d="M345 288Q357 296 369 284" stroke="#243f55" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M200 137Q195 100 177 98M207 137Q213 100 232 99" stroke={c.base} strokeWidth="9" fill="none" strokeLinecap="round"/>
      <path d="M202 383Q218 416 247 389" fill={c.shade} stroke={c.accent} strokeWidth="2"/>
      <path d="M110 371q94 27 194-2m-145 16q52 15 105 0" stroke={c.light} strokeWidth="2" fill="none"/>
      <path d="M268 175l38 15 39 42m44 59 39-36m-8 50 22-10" stroke={c.accent} strokeWidth="1.5" fill="none"/>
      <Spark x={268} y={175} size={8} color={c.accent}/><Spark x={345} y={232} size={7} color={c.accent}/><Spark x={428} y={255} size={6} color={c.accent}/>
      <circle cx="306" cy="190" r="3" fill={c.accent}/>
    </>;
    case "MUSHROOM": return <>
      <path d="M63 226C83 101 157 58 240 62C323 58 397 101 417 226Q240 272 63 226Z" fill={c.accent} stroke="#73383d" strokeWidth="3"/>
      <path d="M92 209Q113 106 221 82" stroke="#d78c82" strokeWidth="7" fill="none" strokeLinecap="round"/>
      <g fill="#f5dfba"><ellipse cx="173" cy="130" rx="23" ry="17" transform="rotate(-16 173 130)"/><ellipse cx="310" cy="169" rx="27" ry="21" transform="rotate(15 310 169)"/><ellipse cx="115" cy="202" rx="14" ry="10"/><ellipse cx="257" cy="93" rx="11" ry="7"/><circle cx="365" cy="214" r="8"/></g>
      <path d="M86 225Q240 255 394 225" stroke="#e6bf9a" strokeWidth="8" fill="none"/>
      <path d="M157 419q23-18 45 1q20-10 36 6q20-12 42-3q25-16 44-4" fill="none" stroke="#6d8762" strokeWidth="12" strokeLinecap="round"/>
      <Sprig x={142} y={408} scale={.75} rotate={-20} color="#7c956d"/><Sprig x={337} y={407} scale={.55} rotate={25} color="#7c956d"/>
      <path d="M207 261v-17m-3 16h9v13h-9Z" fill="#d8ab63" stroke={c.shade} strokeWidth="1.5"/>
    </>;
    case "ACORN": return <>
      <path d="M92 206Q87 109 240 103Q393 109 388 206Z" fill={c.accent} stroke="#513e31" strokeWidth="3"/>
      <path d="M237 108Q226 62 252 58" stroke="#79553b" strokeWidth="14" fill="none" strokeLinecap="round"/>
      <g stroke="#d4b189" strokeWidth="2" fill="none" opacity=".7"><path d="M135 138L188 194M190 118L257 194M253 116L323 191M310 133L359 184M135 190L193 122M207 194L274 120M285 194L335 146"/><path d="M108 198q132-23 264 0"/></g>
      <g className="jar-motion jar-leaf"><path d="M267 104q50-66 70-37q-5 47-70 37Z" fill="#7c8b5c" stroke="#526442" strokeWidth="2"/>
      <path d="M274 99l52-26m-35 16 5-12m11 3 10 0" fill="none" stroke="#c9d19f" strokeWidth="2"/></g>
      <path d="M122 265q-8 67 43 103m193-103q8 67-43 103M176 391l64 30 64-30" fill="none" stroke={c.accent} strokeWidth="2"/>
      <Spark x={122} y={232} size={7} color={c.light}/>
    </>;
    case "FLOWER": return <>
      <g fill="none" stroke={c.accent} strokeWidth="2.5"><path d="M169 149q-21-31 1-50M277 141q31-38 56-28M356 216q39-28 46 0M343 320q26 38 2 58M231 354q-23 43-53 24M131 291q-41 16-44-8"/>
      <path d="M184 161l-11-19M291 155l14-16M344 229l22-7M330 310l12 21M226 346l-9 24M142 287l-27 6" stroke={c.light} strokeWidth="4"/></g>
      <path d="M209 403q-48 42-83 11q31-35 83-11ZM254 407q50-40 91-7q-28 38-91 7Z" fill="#6f8b70" stroke="#47684f" strokeWidth="2"/>
      <path d="M138 414l63-10m71 4 59-8" stroke="#bace9a" strokeWidth="2"/>
      <Rosette x={363} y={172} size={11} color={c.light} center={c.accent}/><Spark x={115} y={203} size={7} color={c.accent}/>
    </>;
    default: return null;
  }
}
