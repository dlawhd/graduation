/*
 * ReactionBar 역할
 *
 * 쪽지에 남길 수 있는 리액션 버튼들을 한 줄로 보여주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - ❤️ 사랑해
 * - 😊 좋아
 * - 😂 웃겨
 * 같은 버튼을 보여주고,
 * 사용자가 누르면 부모 컴포넌트에게 어떤 리액션을 눌렀는지 알려줘.
 */

// 리액션 enum 값을 화면용 이모지/이름으로 바꿔주는 표
const REACTION_META = {
  LOVE: { emoji: "❤️", label: "사랑해" },
  SMILE: { emoji: "😊", label: "좋아" },
  LAUGH: { emoji: "😂", label: "웃겨" },
  TOUCHING: { emoji: "🥹", label: "감동" },
  MISS_YOU: { emoji: "🫶", label: "보고 싶어" },
  PROUD: { emoji: "🥰", label: "뿌듯해" },
  CHEER: { emoji: "👏", label: "응원해" },
  THANKFUL: { emoji: "🙏", label: "고마워" },
};

// 버튼 보여줄 순서
const REACTION_ORDER = [
  "LOVE",
  "SMILE",
  "LAUGH",
  "TOUCHING",
  "MISS_YOU",
  "PROUD",
  "CHEER",
  "THANKFUL",
];

/*
 * reactionCounts 배열을 안전하게 정리하는 함수야.
 *
 * 서버 응답이 배열이 아니거나 값이 비어 있어도
 * 화면이 터지지 않게 빈 배열로 바꿔준다.
 */
function normalizeReactionCounts(counts) {
  if (!Array.isArray(counts)) return [];

  return counts.filter((item) => item && item.emoji);
}

/*
 * 특정 리액션 개수를 찾는 함수야.
 *
 * 예:
 * note.reactionCounts 안에서 LOVE 개수를 찾아서 보여준다.
 */
function getReactionCount(note, emoji) {
  const counts = normalizeReactionCounts(note?.reactionCounts);
  const found = counts.find((item) => item.emoji === emoji);

  return found?.count ?? 0;
}

export default function ReactionBar({
  note,
  palette,
  disabled = false,
  loading = false,
  onReact,
}) {
  const currentReaction = note?.myReaction ?? null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        리액션
      </p>

      <div className="flex flex-wrap gap-2">
        {REACTION_ORDER.map((reactionKey) => {
          const meta = REACTION_META[reactionKey];
          const isActive = currentReaction === reactionKey;
          const count = getReactionCount(note, reactionKey);

          return (
            <button
              key={reactionKey}
              type="button"
              disabled={disabled || loading}
              onClick={(e) => {
                e.stopPropagation();
                onReact?.(reactionKey);
              }}
              title={meta.label}
              className={`rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                isActive ? palette.primaryButton : palette.outlineButton
              } ${
                disabled || loading
                  ? "cursor-not-allowed opacity-60"
                  : "hover:scale-[1.02]"
              }`}
            >
              <span className="mr-1">{meta.emoji}</span>
              <span>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}