import {
  useEffect,
  useState,
} from "react";

import {
  updateMyNickname,
} from "../../api/profileApi";

import {
  validateNickname,
} from "../../utils/nicknamePolicy";

/*
 * NicknameEditor 역할
 *
 * 현재 닉네임을 보여주고
 * 사용자가 직접 변경할 수 있게 해준다.
 *
 * LOCAL / NAVER / GOOGLE / KAKAO 모두
 * 동일한 컴포넌트를 사용한다.
 */
export default function NicknameEditor({
  me,
  onNicknameUpdated,
}) {

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    nickname,
    setNickname,
  ] = useState(
    me?.name || ""
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");


  /*
   * App의 me 정보가 새로 바뀌면
   * 입력창도 최신 닉네임으로 맞춘다.
   */
  useEffect(() => {

    setNickname(
      me?.name || ""
    );

  }, [
    me?.name,
  ]);


  const validation =
    validateNickname(
      nickname
    );


  /*
   * 닉네임 저장
   */
  async function handleSave() {

    if (!validation.valid) {
      setMessage(
        validation.message
      );

      return;
    }


    /*
     * 기존 닉네임과 똑같으면
     * 서버 요청 없이 편집만 종료한다.
     */
    if (
      validation.normalized ===
      String(me?.name || "").trim()
    ) {

      setEditing(false);
      setMessage("");

      return;
    }


    setSaving(true);
    setMessage("");


    try {

      /*
       * 실제 PATCH /api/v1/me
       */
      const updatedMe =
        await updateMyNickname(
          validation.normalized
        );


      /*
       * App.jsx의 me도 바로 최신 값으로 바꾼다.
       *
       * 그러면 헤더 이름도 즉시 바뀐다.
       */
      onNicknameUpdated?.(
        updatedMe
      );


      setEditing(false);

      setMessage(
        "닉네임을 변경했어요."
      );

    } catch (error) {

      setMessage(
        error?.response?.data?.error
          ?.message ||
        "닉네임을 변경하지 못했어요."
      );

    } finally {

      setSaving(false);
    }
  }


  /*
   * 수정 중이 아닐 때
   */
  if (!editing) {

    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setNickname(
              me?.name || ""
            );

            setMessage("");
            setEditing(true);
          }}
          className="text-xs font-bold text-emerald-600 transition hover:text-emerald-700"
        >
          닉네임 변경
        </button>

        {message && (
          <p className="mt-1.5 text-xs font-semibold text-emerald-600">
            {message}
          </p>
        )}
      </div>
    );
  }


  /*
   * 닉네임 수정 화면
   */
  return (
    <div className="mt-3 rounded-2xl border border-emerald-100 bg-white/80 p-3">

      <input
        type="text"
        value={nickname}
        maxLength={16}
        disabled={saving}
        onChange={(event) => {
          setNickname(
            event.target.value
          );

          setMessage("");
        }}
        placeholder="새 닉네임"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
      />

      <p
        className={[
          "mt-1.5 text-[11px] font-semibold",

          validation.valid
            ? "text-emerald-600"
            : "text-slate-500",
        ].join(" ")}
      >
        {validation.message}
      </p>

      <div className="mt-2 flex gap-2">

        <button
          type="button"
          onClick={handleSave}
          disabled={
            saving ||
            !validation.valid
          }
          className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "저장 중..."
            : "저장"}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setNickname(
              me?.name || ""
            );

            setMessage("");
            setEditing(false);
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}