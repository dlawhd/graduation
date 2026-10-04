import { useId } from "react";
import { getSlotAppearance } from "../slotCatalog.mjs";

/** 새 입구의 재질·세공을 SVG로 그린다. 실제 구멍은 항상 중앙이고 모든 장식은 3.5:1 경계 안에 둔다. */
export default function DecorativeSlotArtwork({ value }) {
  const entry = getSlotAppearance(value);
  const uid = `slot-${useId().replace(/:/g, "")}`;
  const [light, base, edge, accent] = entry.colors;
  const fill = `url(#${uid}-finish)`;
  return <svg aria-hidden="true" focusable="false" data-slot-artwork={entry.id} viewBox="0 0 210 60" className="block h-full w-full overflow-hidden">
    <defs>
      <linearGradient id={`${uid}-finish`} x2={entry.id === "AURORA" ? "1" : "0"} y2="1">
        <stop stopColor={light}/><stop offset=".48" stopColor={base}/><stop offset=".75" stopColor={light}/><stop offset="1" stopColor={base}/>
      </linearGradient>
      <linearGradient id={`${uid}-depth`} x2="0" y2="1"><stop stopColor="#070b19"/><stop offset=".7" stopColor="#202637"/><stop offset="1" stopColor="#42465b"/></linearGradient>
      <clipPath id={`${uid}-clip`}><path d={entry.path}/></clipPath>
    </defs>
    <path d={entry.path} fill={fill} stroke={edge} strokeWidth="2"/>
    <g clipPath={`url(#${uid}-clip)`} strokeLinecap="round" strokeLinejoin="round">
      <SlotDetails kind={entry.id} accent={accent} edge={edge}/>
      {/* 세공은 테두리에만 배치한다. 구멍 중심을 유지해야 쪽지의 도착점도 그대로 맞는다. */}
      <rect x="40" y="20" width="130" height="20" rx="10" fill={edge}/>
      <rect data-slot-opening x="42" y="22" width="126" height="16" rx="8" fill={`url(#${uid}-depth)`}/>
      <path d="M51 40H159" fill="none" stroke={accent} strokeOpacity=".8" strokeWidth="1.5"/>
    </g>
  </svg>;
}

/** 종별 상징은 작은 크기에서도 구분되도록 단순한 선과 면으로 그린다. */
function SlotDetails({ kind, accent, edge }) {
  const star = (x, y, size=5) => <path key={`${x}-${y}`} d={`M${x} ${y-size}L${x+size*.3} ${y-size*.3}L${x+size} ${y}L${x+size*.3} ${y+size*.3}L${x} ${y+size}L${x-size*.3} ${y+size*.3}L${x-size} ${y}L${x-size*.3} ${y-size*.3}Z`} fill={accent}/>;
  const blossom = (x,y) => <g key={x} transform={`translate(${x} ${y})`} fill={accent}>{[0,72,144,216,288].map(angle=><ellipse key={angle} cy="-5" rx="3.5" ry="5" transform={`rotate(${angle})`}/>)}<circle r="2.5" fill={edge}/></g>;
  switch (kind) {
    case "BRASS": return <g stroke={edge} strokeWidth="1.3">{[17,193].map(x=><g key={x}><circle cx={x} cy="30" r="5" fill={accent}/><path d={`M${x-2} 32L${x+2} 28`}/></g>)}<path d="M35 10H175M35 50H175" opacity=".6"/></g>;
    case "ROSE_GOLD": return <g fill="none" stroke={accent} strokeWidth="1.7"><path d="M38 11Q105 3 172 11M38 49Q105 57 172 49M18 30l7-7 7 7-7 7Z M178 30l7-7 7 7-7 7Z"/></g>;
    case "OBSIDIAN": return <g fill="none" stroke={accent} strokeWidth="1.5"><path d="M20 8H190L202 20V40L190 52H20L8 40V20Z M21 18V42M189 18V42"/><path d="M39 11H171" opacity=".5"/></g>;
    case "PEARL": return <g fill={accent} stroke={edge} strokeWidth=".7">{[27,44,61,78,95,112,129,146,163,180].flatMap(x=>[12,48].map(y=><circle key={`${x}-${y}`} cx={x} cy={y} r="4.5"/>))}<circle cx="16" cy="30" r="5"/><circle cx="194" cy="30" r="5"/></g>;
    case "PORCELAIN": return <g fill="none" stroke={accent} strokeWidth="1.8"><path d="M19 35Q10 21 23 17Q36 15 31 31Q29 37 19 35M185 35Q174 21 187 17Q200 15 195 31Q193 37 185 35M20 29q6-9 8-2M186 29q6-9 8-2M50 11q18 7 37 0t37 0t37 0M50 49q18-7 37 0t37 0t37 0"/></g>;
    case "LEATHER": return <g fill="none" stroke={accent} strokeWidth="1.8"><rect x="11" y="10" width="188" height="40" rx="9" strokeDasharray="4 4"/><circle cx="24" cy="30" r="4"/><circle cx="186" cy="30" r="4"/></g>;
    case "LEAF": return <g fill="none" stroke={edge} strokeWidth="1.7"><path d="M12 30Q25 16 35 30Q25 45 12 30M175 30Q190 16 200 30Q190 45 175 30M15 30H32M179 30H197M55 13q50-9 100 0M55 47q50 9 100 0"/></g>;
    case "BAMBOO": return <g stroke={edge} strokeWidth="1.7" fill="none"><path d="M31 6q-7 24 0 48M179 6q7 24 0 48M34 7q-7 23 0 46M176 7q7 23 0 46M63 12H148M63 48H148"/><path d="M11 27q13-15 15-5q-2 9-15 5" fill={accent}/></g>;
    case "BLOSSOM": return <>{blossom(22,30)}{blossom(188,30)}<g stroke={edge} strokeWidth="1.2" fill="none"><path d="M47 11Q105 2 163 11M47 49Q105 58 163 49"/></g>{[61,149].map(x=><ellipse key={x} cx={x} cy="12" rx="6" ry="3" fill={accent}/>)}</>;
    case "PAW": return <g fill={accent} stroke={edge} strokeWidth=".7">{[23,187].map(x=><g key={x}><ellipse cx={x} cy="34" rx="7" ry="5"/>{[-6,0,6].map((dx,i)=><ellipse key={dx} cx={x+dx} cy={i===1 ? 22 : 25} rx="2.8" ry="3.6"/>)}</g>)}<path d="M58 10q7 4 13 0m21 0q7 4 13 0m21 0q7 4 13 0" fill="none"/></g>;
    case "SHELL": return <g stroke={edge} strokeWidth="1.2" fill="none">{[35,60,85,125,150,175].map(x=><path key={x} d={`M${x} 9L105 51`}/>)}<circle cx="21" cy="31" r="4" fill={accent}/><circle cx="189" cy="31" r="4" fill={accent}/></g>;
    case "RIPPLE": return <g fill="none" stroke={accent} strokeWidth="2"><path d="M23 12q20 10 41 0t41 0t41 0t41 0M23 48q20-10 41 0t41 0t41 0t41 0M13 23q9-7 15 0M181 37q9-7 15 0"/><circle cx="21" cy="36" r="4"/></g>;
    case "STARLIGHT": return <><path d="M32 12L67 8L108 13L147 7L181 13" fill="none" stroke={accent} strokeWidth="1"/>{[32,108,181].map(x=>star(x,12,3))}{star(21,30,7)}{star(189,30,7)}{star(137,49,3)}</>;
    case "MOONLIGHT": return <><path d="M27 17A13 13 0 1 0 27 43A15 15 0 0 1 27 17" fill={accent}/>{star(187,29,6)}{star(162,11,3)}{star(132,49,3)}<path d="M52 10Q105 4 150 10" stroke={accent} fill="none" opacity=".5"/></>;
    case "AURORA": return <g fill="none" stroke={accent} strokeWidth="1.7"><path d="M27 12Q67 2 107 12T187 12M23 48Q65 38 105 48T187 48M13 27l8-8 8 8-8 8Z M181 30l8-8 8 8-8 8Z"/></g>;
    case "CRYSTAL": return <g fill="none" stroke={accent} strokeWidth="1.2"><path d="M19 4L35 17H175L191 4M4 19L35 17L40 30L35 43L4 41M19 56L35 43H175L191 56M206 19L175 17L170 30L175 43L206 41M35 17L65 4M175 43L145 56"/></g>;
    case "RIBBON": return <g stroke={edge} fill="none" strokeWidth="1.5"><path d="M36 17L30 30L36 43M174 17L180 30L174 43M7 11L26 30L7 49M203 11L184 30L203 49M53 13Q105 8 157 13M53 47Q105 52 157 47"/><path d="M16 30H27M183 30H194" stroke={accent}/></g>;
    case "KEYHOLE": return <g fill="none" stroke={accent} strokeWidth="1.5"><path d="M36 10H174M36 50H174M16 20q-9 10 0 20M194 20q9 10 0 20"/><path d="M24 20a5 5 0 1 0 0 10l-3 10h6l-3-10" fill={edge}/><circle cx="187" cy="30" r="5"/><path d="M183 34l8-8"/></g>;
    default: return null;
  }
}
