import { useId } from "react";
import { getSlotAppearance } from "../slotCatalog.mjs";

/** 꽃·동물·천체의 실루엣 자체를 구멍으로 그린다. 기존 가로 입구는 별도 렌더러로 보존한다. */
export default function FreeformSlotArtwork({ value }) {
  const entry = getSlotAppearance(value);
  const uid = `portal-${useId().replace(/:/g, "")}`;
  const [light, base, edge, accent] = entry.colors;
  return <svg aria-hidden="true" focusable="false" data-slot-artwork={entry.id} viewBox="0 0 100 100" className="block h-full w-full overflow-hidden">
    <defs>
      <linearGradient id={`${uid}-rim`} x1=".15" y1="0" x2=".8" y2="1"><stop stopColor={light}/><stop offset=".42" stopColor={base}/><stop offset=".68" stopColor={light}/><stop offset="1" stopColor={base}/></linearGradient>
      <radialGradient id={`${uid}-inside`} cx=".5" cy=".85" r=".9"><stop stopColor={edge}/><stop offset=".65" stopColor="#282336"/><stop offset="1" stopColor="#0c1020"/></radialGradient>
      <clipPath id={`${uid}-silhouette`}><path d={entry.path}/></clipPath>
    </defs>
    <path d={entry.path} fill={`url(#${uid}-rim)`} stroke={edge} strokeWidth="1.4" strokeLinejoin="round"/>
    <g clipPath={`url(#${uid}-silhouette)`}>
      {/* 내부 면도 같은 실루엣이다. 꽃 안에 또 가로 슬롯을 그리지 않는다. */}
      <path data-slot-opening d={entry.path} transform="translate(50 50) scale(.72) translate(-50 -50)"
        fill={`url(#${uid}-inside)`} stroke={edge} strokeWidth="2" strokeLinejoin="round"/>
      <path className="slot-rim-glow" d={entry.path} transform="translate(50 50) scale(.87) translate(-50 -50)" fill="none" stroke={accent} strokeOpacity=".65" strokeWidth=".9"/>
    </g>
    <g className="slot-details"><PortalDetails kind={entry.id} edge={edge} accent={accent}/></g>
  </svg>;
}

/** 작은 크기에서도 실루엣을 가리지 않는 테두리 세공만 얹는다. */
function PortalDetails({ kind, edge, accent }) {
  const shine = (x,y) => <path key={`${x}-${y}`} d={`M${x} ${y-3}L${x+1} ${y-1}L${x+3} ${y}L${x+1} ${y+1}L${x} ${y+3}L${x-1} ${y+1}L${x-3} ${y}L${x-1} ${y-1}Z`} fill={accent}/>;
  switch (kind) {
    case "BLOSSOM_GATE": return <g fill={accent}>{[[29,20],[80,47],[58,89],[17,61],[66,12]].map(([x,y])=><g key={x}><circle cx={x} cy={y} r="1.6"/><circle cx={x+2} cy={y+2} r=".7"/></g>)}</g>;
    case "HEART_GATE": return <path d="M14 28Q15 12 32 15" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"/>;
    case "PAW_GATE": return <g fill={accent}>{[[17,15],[40,8],[65,9],[88,23]].map(([x,y])=><ellipse key={x} cx={x} cy={y} rx="2" ry="3"/>)}<path d="M26 78Q28 84 36 84" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"/></g>;
    case "BUTTERFLY_GATE": return <g stroke={accent} strokeWidth="1.8" fill="none" strokeLinecap="round"><path d="M43 33Q35 10 17 18M57 33Q65 10 83 18M30 76L38 68M70 76L62 68"/></g>;
    case "LEAF_GATE": return <path d="M17 86Q31 58 82 14" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round"/>;
    case "SHELL_GATE": return <g stroke={accent} strokeWidth="1.2" fill="none"><path d="M13 42L26 56M27 22L35 42M53 10V30M80 26L71 42M94 45L82 58"/></g>;
    case "DROP_GATE": return <path d="M25 57Q23 67 27 73" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round"/>;
    case "CLOUD_GATE": return <g fill={accent}><circle cx="35" cy="23" r="2"/><circle cx="21" cy="54" r="1.6"/><circle cx="78" cy="73" r="1.3"/></g>;
    case "STAR_GATE": return <g>{shine(50,16)}{shine(77,82)}{shine(16,40)}</g>;
    case "MOON_GATE": return <g>{shine(18,39)}{shine(47,85)}<circle cx="19" cy="62" r="1.5" fill={accent}/></g>;
    case "CRYSTAL_GATE": return <g fill="none" stroke={accent} strokeWidth="1"><path d="M50 4L50 16M15 23L25 29M86 22L77 30M95 61L83 57M50 96L50 82M4 62L17 57"/></g>;
    case "PLANET_GATE": return <g><path d="M17 38C-13 70 22 99 77 53C106 28 91 17 77 25" fill="none" stroke={edge} strokeWidth="7"/><path d="M17 38C-13 70 22 99 77 53C106 28 91 17 77 25" fill="none" stroke={accent} strokeWidth="3"/>{shine(35,22)}</g>;
    case "RIBBON_GATE": return <g fill="none" stroke={accent} strokeWidth="1.5"><path d="M12 30Q21 33 34 41M88 30Q79 33 66 41M18 59L31 54M82 59L69 54"/></g>;
    case "KEY_GATE": return <g fill={accent}><circle cx="50" cy="11" r="2"/><circle cx="29" cy="88" r="1.5"/><circle cx="71" cy="88" r="1.5"/></g>;
    case "SUN_GATE": return <g>{shine(50,14)}{shine(25,23)}{shine(76,77)}<circle cx="12" cy="64" r="1.7" fill={accent}/></g>;
    case "SNOWFLAKE_GATE": return <g stroke={accent} strokeWidth="1.5" fill="none"><path d="M50 9V24M50 76V91M18 29L30 37M70 63L82 71M18 71L30 63M70 37L82 29"/></g>;
    default: return <g>{shine(23,24)}{shine(76,77)}</g>;
  }
}
