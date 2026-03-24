import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/apiClient";

// 영어 enum 값을 화면용 한글로 바꿔주는 작은 사전
const OPEN_MODE_LABEL = {
  ALL_AT_ONCE: "한 번에 전체 공개",
  DAILY_DRAW: "하루 1장 랜덤",
};

const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 잠금",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

const ROLE_LABEL = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
};

// 날짜를 보기 좋게 바꿔주는 함수
function formatDate(dateTime) {
  if (!dateTime) return "-";

  return new Date(dateTime).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function JarsPage() {
  // 서버에서 받아온 저금통 목록
  const [items, setItems] = useState([]);

  // 로딩 중인지 표시
  const [loading, setLoading] = useState(true);

  // 에러 메시지 저장
  const [error, setError] = useState("");

  // 현재 페이지 번호
  const [page, setPage] = useState(0);

  // 전체 페이지 수
  const [totalPages, setTotalPages] = useState(0);

  // 저금통 목록 불러오는 함수
  const loadJars = async (targetPage = 0) => {
    setLoading(true);
    setError("");

    try {
      const res = await apiClient.get("/api/v1/jars", {
        params: {
          page: targetPage,
          size: 10,
        },
      });

      // 우리 서버는 항상 { data: ... } 형태로 감싸서 보내줘요.
      const data = res.data?.data;

      setItems(data?.items || []);
      setPage(data?.page || 0);
      setTotalPages(data?.totalPages || 0);
    } catch (e) {
      // 서버 에러가 있으면 보기 쉬운 문장으로 바꿔서 저장
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 목록을 불러오지 못했어요.";

      setError(serverMessage);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // 페이지가 처음 열릴 때 목록을 한 번 불러와요.
  useEffect(() => {
    loadJars(0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* 맨 위 제목 영역 */}
        <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">내 저금통 목록</h1>
            <p className="mt-2 text-sm text-slate-500">
              내가 참여 중인 저금통들을 한눈에 볼 수 있어요.
            </p>
          </div>

          {/* 다음 단계인 생성 페이지로 가는 버튼 */}
          <Link
            to="/jars/new"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + 새 저금통 만들기
          </Link>
        </div>

        {/* 에러가 있을 때 보여주는 카드 */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 로딩 중 화면 */}
        {loading && (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
            저금통 목록을 불러오는 중이에요...
          </div>
        )}

        {/* 로딩 끝 + 목록이 비어 있을 때 */}
        {!loading && items.length === 0 && !error && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-800">
              아직 참여 중인 저금통이 없어요.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              첫 번째 저금통을 만들어서 시작해보자!
            </p>

            <Link
              to="/jars/new"
              className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              저금통 만들러 가기
            </Link>
          </div>
        )}

        {/* 실제 목록 카드 */}
        {!loading && items.length > 0 && (
          <div className="grid gap-4">
            {items.map((jar) => (
              <div
                key={jar.jarId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {jar.theme}
                      </span>

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        내 역할: {ROLE_LABEL[jar.myRole] || jar.myRole}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          jar.isOpen
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {jar.isOpen ? "OPEN" : "LOCKED"}
                      </span>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900">{jar.name}</h2>

                    <p className="mt-2 text-sm text-slate-500">
                      {jar.description || "설명이 아직 없어요."}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      {OPEN_MODE_LABEL[jar.openMode] || jar.openMode} ·{" "}
                      {LOCK_LEVEL_LABEL[jar.lockLevel] || jar.lockLevel} ·{" "}
                      {jar.memberCount}/{jar.maxMembers}명
                    </p>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <div>오픈 날짜: {formatDate(jar.openAt)}</div>
                      <div>최근 수정: {formatDate(jar.updatedAt)}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/jars/${jar.jarId}`}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      상세 보기
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 페이지 이동 버튼 */}
        {!loading && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => loadJars(page - 1)}
              disabled={page === 0}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>

            <span className="text-sm text-slate-600">
              {page + 1} / {totalPages}
            </span>

            <button
              onClick={() => loadJars(page + 1)}
              disabled={page + 1 >= totalPages}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}