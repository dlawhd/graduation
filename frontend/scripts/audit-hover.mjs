import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** JSX의 클릭 컨트롤과 기존 hover 표시를 읽기 전용으로 집계한다. 동적 class는 공통 CSS의 실제 DOM 조건으로 판별한다. */
const root = fileURLToPath(new URL("../src/", import.meta.url));
const rows = [];
let filesRead = 0;
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes:true })) {
    const filename = path.join(folder,entry.name);
    if (entry.isDirectory()) { await scan(filename); continue; }
    if (!/\.[jt]sx?$/.test(entry.name)) continue;
    const source = await readFile(filename,"utf8"); filesRead++;
    const starts = /<(button|motion\.button|a|motion\.a|Link|NavLink|summary|input)\b/g;
    const stats = { file:path.relative(root,filename).replaceAll("\\","/"), controls:0, explicitHover:0, sharedClass:0, fallbackCandidates:0, motion:0 };
    for (const match of source.matchAll(starts)) {
      // JSX 속성 안의 함수/템플릿에 있는 '>'를 시작 태그의 끝으로 잘못 읽지 않는다.
      let end = match.index + match[0].length, braces = 0, quote = "";
      for (; end < source.length; end++) {
        const char = source[end];
        if (quote) { if(char === "\\") end++; else if(char === quote) quote=""; continue; }
        if (["'",'"',"`"].includes(char)) quote=char;
        else if(char === "{") braces++;
        else if(char === "}") braces--;
        else if(char === ">" && braces === 0) break;
      }
      const tag = source.slice(match.index,end+1);
      if (match[1] === "input" && !/type=["'](?:button|submit|reset)["']/.test(tag)) continue;
      stats.controls++;
      if (/whileHover=/.test(tag)) stats.motion++;
      else if (/hover:|(?:naver-btn|ghost-btn|danger-btn|toplink)/.test(tag)) stats.explicitHover++;
      else if (/className=\{(?:controlClass|buttonClass|btnClass)\b/.test(tag)) stats.sharedClass++;
      else stats.fallbackCandidates++;
    }
    if (stats.controls) rows.push(stats);
  }
}
await scan(root);
const total = rows.reduce((sum,row)=>Object.fromEntries(Object.keys(sum).map(key=>[key,sum[key]+row[key]])),{controls:0,explicitHover:0,sharedClass:0,fallbackCandidates:0,motion:0});
console.log(JSON.stringify({filesRead,controlFiles:rows.length,total,files:rows},null,2));
