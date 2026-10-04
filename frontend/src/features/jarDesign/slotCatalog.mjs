/** 입구의 이름·분류·재질·외곽선을 한 곳에서 관리한다. 좌표와 크기는 기존 슬롯 계약을 그대로 쓴다. */
export const SLOT_COLLECTIONS = Object.freeze(["전체", "클래식 입구", "꽃과 자연", "상상의 문"]);

const capsule = "M30 4H180A26 26 0 0 1 180 56H30A26 26 0 0 1 30 4Z";
const bevel = "M19 4H191L206 19V41L191 56H19L4 41V19Z";
const leaf = "M5 30Q25 3 72 7Q105 0 138 7Q185 3 205 30Q185 57 138 53Q105 60 72 53Q25 57 5 30Z";
const ribbon = "M5 10L36 17Q105 3 174 17L205 10L193 30L205 50L174 43Q105 57 36 43L5 50L17 30Z";

const definitions = [
  ["CAPSULE", "말랑한 캡슐", "기본", "오래 보아도 편안한 둥근 입구"],
  ["RECTANGLE", "반듯한 직선", "기본", "깔끔하고 단정한 직선"],
  ["OVAL", "부드러운 타원", "기본", "차분한 타원형 입구"],
  ["METAL", "은빛 테두리", "기본", "빛을 머금은 실버 프레임"],
  ["WOOD", "우드 프레임", "기본", "따뜻한 나뭇결 테두리"],
  ["PIXEL", "레트로 픽셀", "기본", "각진 도트 게임 감성"],
  ["BRASS", "앤티크 황동", "공방 재질", "작은 나사와 오래된 금빛", bevel, ["#f8dfa1", "#c59b50", "#80602b", "#fdf0c4"]],
  ["ROSE_GOLD", "로즈골드", "공방 재질", "장밋빛 금속과 섬세한 세공", capsule, ["#ffe4de", "#d69786", "#8f584f", "#fff4eb"]],
  ["OBSIDIAN", "흑요석", "공방 재질", "검은 광택과 샴페인 골드", bevel, ["#686377", "#292636", "#b9a375", "#ece1bf"]],
  ["PEARL", "진주 목걸이", "공방 재질", "한 알씩 둘러진 크림 진주", capsule, ["#fff9ef", "#e0cbb9", "#b39a83", "#ffffff"]],
  ["PORCELAIN", "청화 도자기", "공방 재질", "우윳빛 유약 위 코발트 꽃", capsule, ["#ffffff", "#dce9f1", "#6686a8", "#396994"]],
  ["LEATHER", "가죽 스티치", "공방 재질", "캐러멜 가죽과 손바느질", "M17 5H193Q204 5 204 17V43Q204 55 193 55H17Q6 55 6 43V17Q6 5 17 5Z", ["#dba878", "#a96d45", "#704329", "#f6dcc0"]],
  ["LEAF", "잎사귀 편지", "작은 자연", "초록 잎맥을 따라 담는 추억", leaf, ["#d9ebc4", "#82a574", "#4d7755", "#eef6d9"]],
  ["BAMBOO", "대나무 마디", "작은 자연", "올리브빛 대나무와 작은 마디", capsule, ["#e2dba6", "#a4ac70", "#687749", "#f5ebc7"]],
  ["BLOSSOM", "벚꽃 화관", "작은 자연", "꽃송이가 감싸는 분홍 입구", leaf, ["#ffe4ed", "#eab0c4", "#b77596", "#fff8fb"]],
  ["PAW", "포근한 발바닥", "작은 자연", "동물 친구를 위한 보송한 패드", "M25 7Q45 2 57 13Q79 1 94 12Q116 1 133 12Q154 1 170 13Q187 2 197 15Q211 31 197 48Q180 59 160 51Q135 59 105 53Q75 59 50 51Q22 59 10 43Q0 25 25 7Z", ["#fff0dc", "#dfb997", "#ae8266", "#fef8eb"]],
  ["SHELL", "조개 세공", "작은 자연", "바닷빛 자개와 부채살", "M6 34Q10 15 28 14Q34 2 51 10Q66 0 82 7Q105 0 128 7Q144 0 159 10Q176 2 182 14Q200 15 204 34Q190 57 165 51Q105 60 45 51Q20 57 6 34Z", ["#e7faf5", "#a5cec9", "#679d9b", "#ffffff"]],
  ["RIPPLE", "물결 유리", "작은 자연", "잔잔한 파도가 겹친 유리", "M5 30Q15 6 36 10Q66 1 105 7Q144 1 174 10Q195 6 205 30Q195 54 174 50Q144 59 105 53Q66 59 36 50Q15 54 5 30Z", ["#e4f9ff", "#8bbcd6", "#527f9e", "#f5ffff"]],
  ["STARLIGHT", "별자리 문", "꿈과 장식", "작은 별과 황금빛 궤도", bevel, ["#7a7ba8", "#424b76", "#d4bd7e", "#fff0bd"]],
  ["MOONLIGHT", "초승달 안부", "꿈과 장식", "남빛 하늘에 걸린 작은 달", capsule, ["#9fadd1", "#5e6b9b", "#39496c", "#fff3c9"]],
  ["AURORA", "오로라 리본", "꿈과 장식", "라일락에서 민트로 흐르는 빛", capsule, ["#b7efe1", "#b6a4dc", "#776ba4", "#fff5fe"]],
  ["CRYSTAL", "수정의 틈", "꿈과 장식", "보석처럼 각진 프리즘 컷", bevel, ["#eee3ff", "#b7a0d8", "#806999", "#fffaff"]],
  ["RIBBON", "선물 리본", "꿈과 장식", "양쪽으로 펼쳐진 벨벳 리본", ribbon, ["#f9d7df", "#cf7e98", "#9b526d", "#ffeef1"]],
  ["KEYHOLE", "비밀 서랍", "꿈과 장식", "작은 열쇠 문양과 빈티지 세공", bevel, ["#e8d7b3", "#b59a6d", "#806845", "#fff3d6"]],
];

// V42 ID의 도면·3.5:1 크기는 보존한다. 새 실루엣은 별도 ID로 저장해 기존 저금통이 변하지 않게 한다.
export const LEGACY_SLOT_CATALOG = Object.freeze(definitions.map(([id, name, collection, description, path, colors]) =>
  Object.freeze({ id, name, collection, description, path, colors: colors && Object.freeze(colors), aspectRatio: 3.5 })));

const freeform = [
  ["BLOSSOM_GATE", "벚꽃 한 송이", "꽃과 자연", "다섯 꽃잎 사이로 스며드는 봄", "M50 21C20-7 4 20 24 42C-6 60 14 90 39 76C45 107 76 98 73 68C103 69 111 38 80 34C94 5 59-7 50 21Z", ["#fff1f7","#eaa0be","#b26386","#fff8eb"]],
  ["HEART_GATE", "러브레터", "꽃과 자연", "마음을 그대로 담는 하트", "M50 91C37 78 5 55 5 30C5 4 36 0 50 22C64 0 95 4 95 30C95 55 63 78 50 91Z", ["#ffe3e8","#d77793","#a44065","#fff2ee"]],
  ["PAW_GATE", "냥냥 발도장", "꽃과 자연", "폭신한 발바닥 네 개와 작은 패드", "M18 34C4 34 4 10 17 9C30 8 33 33 18 34ZM40 25C26 25 28 2 41 2C54 2 54 25 40 25ZM64 26C50 26 52 2 65 3C79 4 78 28 64 26ZM84 40C70 38 74 13 88 16C102 20 98 43 84 40ZM50 37C65 37 73 53 84 65C103 91 73 99 55 88C36 100 5 91 19 67C30 53 35 37 50 37Z", ["#fff0dc","#dca88b","#a76c59","#fff8ec"], [.5,.66]],
  ["BUTTERFLY_GATE", "나비의 비밀", "꽃과 자연", "펼쳐진 네 날개가 하나의 문으로", "M48 39C35 7 3 0 5 32C5 45 17 53 28 53C0 68 14 96 37 84L50 65L63 84C86 96 100 68 72 53C83 53 95 45 95 32C97 0 65 7 52 39Z", ["#e9e0ff","#b4a0dd","#7964aa","#fff4fb"]],
  ["LEAF_GATE", "숲의 엽서", "꽃과 자연", "비스듬히 자란 한 장의 잎", "M12 91C0 54 18 7 90 7C98 60 66 98 12 91Z", ["#edf2c7","#8caa70","#53794e","#fbffe9"]],
  ["SHELL_GATE", "인어의 조개", "꽃과 자연", "바닷빛 부채에 숨겨 둔 이야기", "M50 90L8 53C-2 41 4 24 17 27C11 7 34 2 40 17C42-4 63-4 66 17C79 2 97 17 84 30C98 28 100 44 92 57L58 90Z", ["#eafaf9","#95c9cd","#60949f","#ffedee"]],
  ["DROP_GATE", "이슬 한 방울", "꽃과 자연", "맑고 길쭉한 물방울의 문", "M50 4C40 25 13 43 13 66C13 109 87 109 87 66C87 43 60 25 50 4Z", ["#e9faff","#80bad5","#528aa9","#f5ffff"], [.5,.62]],
  ["CLOUD_GATE", "몽글 구름", "꽃과 자연", "하늘 위에 띄워 둔 폭신한 편지", "M23 82C-5 80-2 45 20 42C11 14 49 2 59 26C83 9 104 39 89 54C114 78 85 91 68 83Z", ["#fff5e7","#bfc8e1","#8595b8","#ffffff"], [.5,.57]],
  ["STAR_GATE", "소원별", "상상의 문", "다섯 갈래 별 속에 담는 소원", "M50 3L63 34L97 37L71 59L79 94L50 76L21 94L29 59L3 37L37 34Z", ["#fff2bb","#d9b86a","#a78948","#fffce6"]],
  ["MOON_GATE", "달의 우편함", "상상의 문", "초승달의 안쪽으로 보내는 밤", "M70 5C5-6-15 74 45 94C67 101 85 89 95 73C41 83 19 34 70 5Z", ["#f4edff","#aba2d4","#756894","#fff5c9"], [.35,.5]],
  ["CRYSTAL_GATE", "꿈의 프리즘", "상상의 문", "육각 보석처럼 빛나는 틈", "M50 3L86 22L96 62L50 97L4 62L14 22Z", ["#f4e6ff","#b79cdb","#8164aa","#faffff"]],
  ["PLANET_GATE", "작은 토성", "상상의 문", "행성 둘레를 가로지르는 금빛 궤도", "M50 13A37 37 0 1 1 50 87A37 37 0 1 1 50 13Z", ["#ffeccc","#d4b095","#9b7965","#f8f2e7"]],
  ["RIBBON_GATE", "리본 약속", "상상의 문", "선물의 매듭처럼 펼쳐진 입구", "M45 33C26 15 3 5 4 30L11 59C20 82 37 64 49 57C61 68 81 83 90 59L96 30C97 5 74 15 55 33Z", ["#ffe4ed","#cf89a8","#975b7b","#fff5f8"], [.5,.46]],
  ["KEY_GATE", "비밀의 열쇠", "상상의 문", "열쇠구멍 너머 우리만의 세계", "M50 5A27 27 0 0 1 65 54L79 95H21L35 54A27 27 0 0 1 50 5Z", ["#f7e7b6","#bd9c62","#876b40","#fff7dd"], [.5,.34]],
  ["SUN_GATE", "햇살 조각", "상상의 문", "동그란 해와 여덟 갈래 햇빛", "M50 3L60 20L78 9L79 29L97 35L83 50L97 65L79 71L78 91L60 80L50 97L40 80L22 91L21 71L3 65L17 50L3 35L21 29L22 9L40 20Z", ["#fff0bb","#e3b36b","#ad7846","#fff9e6"]],
  ["SNOWFLAKE_GATE", "눈꽃 편지", "상상의 문", "여섯 갈래 얼음 결정의 문", "M43 4H57L59 27L78 14L87 28L67 42L91 43V57L67 58L87 72L78 86L59 73L57 96H43L41 73L22 86L13 72L33 58L9 57V43L33 42L13 28L22 14L41 27Z", ["#f1fbff","#abcfe1","#769bb5","#ffffff"]],
];

export const FREEFORM_SLOT_CATALOG = Object.freeze(freeform.map(([id,name,collection,description,path,colors,target=[.5,.5]]) =>
  Object.freeze({id,name,collection,description,path,colors:Object.freeze(colors),aspectRatio:1,freeform:true,
    target:Object.freeze({x:target[0],y:target[1],width:.12,height:.12})})));
export const SLOT_CATALOG = Object.freeze([
  ...LEGACY_SLOT_CATALOG.slice(0,8).map(entry=>Object.freeze({...entry,collection:"클래식 입구"})),
  ...FREEFORM_SLOT_CATALOG,
]);
export const SLOT_STYLES = Object.freeze(SLOT_CATALOG.map(({ id, name }) => Object.freeze([id, name])));
const byId = new Map([...LEGACY_SLOT_CATALOG, ...SLOT_CATALOG].map(entry => [entry.id, entry]));
export const getSlotAppearance = value => byId.get(value) || SLOT_CATALOG[0];
export const filterSlotStyles = collection => SLOT_CATALOG.filter(entry => collection === "전체" || entry.collection === collection);
