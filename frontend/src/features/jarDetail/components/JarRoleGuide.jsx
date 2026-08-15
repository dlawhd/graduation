import { useState } from "react";
import {
  ROLE_GUIDE_ITEMS,
  ROLE_LABEL,
} from "../constants/jarDetailLabels";

/*
 * JarRoleGuide 역할
 *
 * 방장 / 관리자 / 멤버가
 * 어떤 일을 할 수 있는지 알려주는 역할 안내 컴포넌트다.
 *
 * 평소에는 작은 "역할 안내 ?" 버튼만 보여주고,
 * 사용자가 버튼을 누르면 역할별 설명을 펼쳐서 보여준다.
 *
 * currentRole:
 * 현재 로그인한 사용자의 역할
 *
 * 예:
 * OWNER
 * ADMIN
 * MEMBER
 *
 * palette:
 * 현재 저금통 테마의 색상 정보를 받아서
 * 역할 안내도 저금통 디자인과 자연스럽게 맞춘다.
 */
export default function JarRoleGuide({
  currentRole,
  palette,
  className = "",
}) {
  /*
   * 역할 설명이 펼쳐져 있는지 기억한다.
   *
   * false → 접혀 있음
   * true  → 역할 설명 표시
   */
  const [open, setOpen] = useState(false);

  /*
   * 역할별 이름표 색상
   *
   * 방장    → 따뜻한 노란색
   * 관리자  → 파란색
   * 멤버    → 회색
   */
  const getRoleChipClass = (role) => {
    if (role === "OWNER") {
      return "bg-amber-100 text-amber-700";
    }

    if (role === "ADMIN") {
      return "bg-sky-100 text-sky-700";
    }

    return "bg-slate-100 text-slate-600";
  };

  return (
    <section
      className={`rounded-2xl border p-4 ${
        palette?.softCard ??
        "border-slate-200 bg-white"
      } ${className}`}
    >
      {/* 역할 안내 제목 + 열기/닫기 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-slate-800">
              역할 안내
            </p>

            {/* 현재 로그인 사용자의 역할도 함께 표시한다. */}
            {currentRole && (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${getRoleChipClass(
                  currentRole
                )}`}
              >
                내 역할:{" "}
                {ROLE_LABEL[currentRole] ||
                  currentRole}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            방장, 관리자, 멤버가 할 수 있는 일을
            확인해보세요.
          </p>
        </div>

        <button
          type="button"

          /*
           * 스크린리더도 현재 설명이
           * 열렸는지 알 수 있도록 알려준다.
           */
          aria-expanded={open}

          onClick={() =>
            setOpen((prev) => !prev)
          }

          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          {/* 작은 물음표 아이콘 */}
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-600">
            ?
          </span>

          {open ? "역할 안내 닫기" : "역할 안내"}
        </button>
      </div>

      {/* 사용자가 역할 안내 버튼을 눌렀을 때만 표시한다. */}
      {open && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {ROLE_GUIDE_ITEMS.map((item) => {
            /*
             * 현재 사용자의 역할인지 확인한다.
             *
             * 예:
             * 내가 ADMIN이면 관리자 카드에
             * "내 역할" 표시를 붙인다.
             */
            const isMyRole =
              item.role === currentRole;

            return (
              <article
                key={item.role}
                className={`rounded-2xl border bg-white/90 p-4 ${
                  isMyRole
                    ? "ring-2 ring-slate-200"
                    : "border-slate-100"
                }`}
              >
                {/* 역할 이름 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${getRoleChipClass(
                      item.role
                    )}`}
                  >
                    {item.title}
                  </span>

                  {/* 현재 내 역할이면 눈에 띄게 알려준다. */}
                  {isMyRole && (
                    <span className="text-[11px] font-bold text-slate-500">
                      내 역할
                    </span>
                  )}
                </div>

                {/* 역할에 대한 짧은 설명 */}
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
                  {item.description}
                </p>

                {/* 이 역할이 할 수 있는 일 */}
                <ul className="mt-3 space-y-2">
                  {item.permissions.map(
                    (permission) => (
                      <li
                        key={permission}
                        className="flex gap-2 text-xs leading-5 text-slate-500"
                      >
                        <span
                          className="mt-[1px] shrink-0 font-black text-slate-300"
                          aria-hidden="true"
                        >
                          •
                        </span>

                        <span>{permission}</span>
                      </li>
                    )
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}