/** 실제 SVG에서 테두리 안·구멍 밖임을 확인한 반사광 좌표다. 렌더링 중 경로 탐색이나 타이머를 돌리지 않는다. */
const defaultPoints = Object.freeze([Object.freeze([28,20]), Object.freeze([76,78])]);
const customPoints = {
  BLOSSOM_GATE:[[28,20],[72,74]], HEART_GATE:[[28,18],[70,70]], PAW_GATE:[[26,18],[78,78]],
  LEAF_GATE:[[32,26],[70,72]], SHELL_GATE:[[28,20],[72,74]], DROP_GATE:[[36,28],[76,78]],
  STAR_GATE:[[42,26],[74,78]], CRYSTAL_GATE:[[28,20],[74,76]], PLANET_GATE:[[30,22],[74,76]],
  RIBBON_GATE:[[28,22],[76,70]], KEY_GATE:[[28,20],[72,80]], TULIP_GATE:[[22,22],[74,76]],
  DAISY_GATE:[[30,20],[70,78]], LOTUS_GATE:[[36,24],[76,78]], CLOVER_GATE:[[28,20],[78,78]],
  CROWN_GATE:[[40,26],[76,78]], WING_GATE:[[18,20],[74,76]], PORTAL_GATE:[[28,20],[82,78]],
  CAT_GATE:[[26,20],[76,78]], BUNNY_GATE:[[24,20],[76,78]], BEAR_GATE:[[26,16],[78,78]],
  FOX_GATE:[[18,16],[72,74]], PANDA_GATE:[[30,18],[76,78]], KOALA_GATE:[[20,28],[76,78]],
  OWL_GATE:[[24,18],[76,78]], WHALE_GATE:[[30,28],[72,72]], FISH_GATE:[[30,26],[84,78]],
  HEDGEHOG_GATE:[[30,20],[76,78]], DINO_GATE:[[30,20],[80,78]], WAVE_GATE:[[30,22],[76,82]],
  ANCHOR_GATE:[[44,18],[78,78]], CORAL_GATE:[[24,20],[76,74]], SEAHORSE_GATE:[[28,20],[74,80]],
  TURTLE_GATE:[[26,18],[78,80]], DOLPHIN_GATE:[[34,26],[68,86]], STARFISH_GATE:[[28,26],[66,78]],
  OCTOPUS_GATE:[[28,20],[82,84]], SAIL_GATE:[[34,26],[76,78]], CONCH_GATE:[[32,20],[76,78]],
  COMET_GATE:[[40,28],[74,74]], UFO_GATE:[[32,20],[76,72]], ROCKET_GATE:[[32,24],[76,78]],
  ECLIPSE_GATE:[[56,6],[76,78]], NOVA_GATE:[[24,24],[78,78]], METEOR_GATE:[[38,26],[76,78]],
  CONSTELLATION_GATE:[[26,24],[76,78]], AURORA_GATE:[[34,22],[70,72]], DONUT_GATE:[[28,20],[74,70]],
  ICECREAM_GATE:[[28,20],[68,68]], CANDY_GATE:[[20,26],[80,74]], CAKE_GATE:[[28,30],[76,84]],
  CHERRY_GATE:[[38,28],[78,82]], STRAWBERRY_GATE:[[28,18],[74,74]], PEACH_GATE:[[32,30],[76,78]],
  PUDDING_GATE:[[28,20],[80,80]], TEACUP_GATE:[[28,20],[76,66]], CAMERA_GATE:[[32,20],[76,80]],
  MUSIC_GATE:[[40,20],[78,80]], PIANO_GATE:[[28,20],[76,80]], GUITAR_GATE:[[30,48],[72,78]],
  PALETTE_GATE:[[28,20],[68,80]], ENVELOPE_GATE:[[28,20],[76,84]], UMBRELLA_GATE:[[28,20],[56,78]],
  BALLOON_GATE:[[28,20],[74,74]], PUZZLE_GATE:[[28,16],[76,84]], GAMEPAD_GATE:[[28,20],[78,80]],
  TICKET_GATE:[[28,20],[76,80]], TRIANGLE_GATE:[[40,26],[76,82]], DIAMOND_GATE:[[32,24],[72,72]],
  ARCH_GATE:[[28,20],[78,78]], FAN_GATE:[[28,20],[72,74]], SPIRAL_GATE:[[40,32],[80,80]],
  KITE_GATE:[[32,26],[66,72]], PRISM_GATE:[[28,20],[68,70]], ROSETTE_GATE:[[28,20],[76,74]],
  MITTEN_GATE:[[34,20],[76,78]], BABY_SOCK_GATE:[[28,20],[78,82]], BOWTIE_GATE:[[18,20],[82,78]],
  BABY_BIB_GATE:[[28,18],[76,78]], CUSHION_GATE:[[28,18],[76,82]], SLIPPER_GATE:[[26,20],[78,80]],
  POUCH_GATE:[[30,16],[78,78]], HEART_PATCH_GATE:[[28,18],[70,70]], QUILT_GATE:[[28,18],[76,84]],
  LADYBUG_GATE:[[30,20],[76,78]], SNAIL_GATE:[[26,30],[76,84]], SPROUT_GATE:[[28,20],[56,86]],
  TOADSTOOL_GATE:[[28,20],[62,78]], ACORN_GATE:[[28,20],[70,76]], GARDEN_HOUSE_GATE:[[30,24],[78,78]],
  BEE_GATE:[[28,16],[76,78]], APPLE_GATE:[[34,28],[76,78]], CARROT_GATE:[[34,12],[68,68]],
  SUNFLOWER_GATE:[[26,20],[76,78]], GARDEN_SIGN_GATE:[[28,18],[58,78]], TOY_DUCK_GATE:[[26,20],[76,78]],
  ROCKING_HORSE_GATE:[[28,20],[82,84]], TEDDY_TOY_GATE:[[28,16],[76,82]], TOY_TRAIN_GATE:[[28,26],[76,78]],
  TOY_BLOCK_GATE:[[28,20],[76,84]], PINWHEEL_GATE:[[28,24],[76,78]], MUSIC_BOX_GATE:[[32,22],[76,82]],
  SNOW_GLOBE_GATE:[[28,20],[76,82]], TOY_SAIL_GATE:[[32,24],[76,78]],
};
const anchors = Object.freeze(Object.fromEntries(Object.entries(customPoints).map(([id,points]) =>
  [id,Object.freeze(points.map(point=>Object.freeze(point)))])));
const legacyPoints = Object.freeze([Object.freeze([32,9]),Object.freeze([180,49])]);
const legacyAnchors = Object.freeze({
  LEAF:[[34,12],[180,46]], BLOSSOM:[[34,12],[180,46]], SHELL:[[34,10],[180,48]],
  RIPPLE:[[32,12],[180,48]], RIBBON:[[32,18],[184,44]],
});

export function slotGlints(entry) { return entry.freeform ? anchors[entry.id] || defaultPoints : legacyAnchors[entry.id] || legacyPoints; }

/** 주기를 조금씩 분산해 모든 카드가 동시에 반짝이는 것을 피한다. */
export function slotGlintTiming(id) {
  const seed = Array.from(id).reduce((sum,letter)=>sum+letter.charCodeAt(0),0);
  return { duration:8.6+(seed%4)*.65, delay:-(seed%9)*.61 };
}
