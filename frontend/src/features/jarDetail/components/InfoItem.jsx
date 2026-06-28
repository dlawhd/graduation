/*
 * InfoItem 역할
 *
 * 저금통 상세 화면에서
 * "이름표 + 값" 형태의 작은 정보 박스를 보여주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 내 역할: 방장
 * - 테마: 봄
 * - 참여 인원: 2 / 5명
 * 같은 정보를 작은 카드로 보여준다.
 */
export default function InfoItem({ label, value, className = "" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>

      <p className="text-sm font-semibold text-slate-700">
        {value || "-"}
      </p>
    </div>
  );
}