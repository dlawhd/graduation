import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  drawDailyDrawToday,
  getDailyDrawHistory,
  getDailyDrawToday,
} from "../../../api/dailyDrawApi";

/*
 * useJarDailyDraw 역할
 *
 * 저금통 상세 페이지의 "오늘의 추억 한 장" 상태와 기능을 관리하는 Hook이야.
 *
 * 쉽게 말하면:
 * - 오늘 뽑힌 카드 조회하기
 * - 뽑기 기록 조회하기
 * - 오늘 카드 뽑기
 * - 사용자가 오늘 결과를 봤는지 localStorage에 저장하기
 * 를 JarDetailPage 대신 맡아주는 "추억 뽑기 담당자"다.
 */
export function useJarDailyDraw({ jarId, jar, memoryDrawOpen, loadJarZoomNotes }) {
  // 오늘 뽑힌 추억 쪽지 상태
  const [dailyDrawToday, setDailyDrawToday] = useState(null);

  // 지금까지의 추억 뽑기 기록
  const [dailyDrawHistory, setDailyDrawHistory] = useState([]);

  // 뽑기 조회/실행 로딩 상태
  const [dailyDrawLoading, setDailyDrawLoading] = useState(false);
  const [dailyDrawDrawing, setDailyDrawDrawing] = useState(false);

  // 뽑기 관련 에러 메시지
  const [dailyDrawError, setDailyDrawError] = useState("");

  // 사용자가 마지막으로 확인한 추억 쪽지 뽑기 결과를 저장한다.
  const [memoryDrawSeenKey, setMemoryDrawSeenKey] = useState("");

  // Daily Draw WebSocket 이벤트를 받았을 때 잠깐 보여줄 안내 문구
  const [dailyDrawRealtimeMessage, setDailyDrawRealtimeMessage] = useState("");

  // 안내 문구를 몇 초 뒤 자동으로 지울 때 사용할 타이머 보관함
  const dailyDrawRealtimeMessageTimerRef = useRef(null);

  /*
   * 현재 오늘 뽑힌 추억 쪽지를 구분하는 값이다.
   *
   * 예:
   * - drawDate가 2026-05-10
   * - drawId가 12
   * - 그러면 "2026-05-10:12" 형태로 저장한다.
   */
  const currentMemoryDrawKey = useMemo(() => {
    const draw = dailyDrawToday?.dailyDraw;

    if (!draw?.drawId) {
      return "";
    }

    return `${draw.drawDate || "today"}:${draw.drawId}`;
  }, [dailyDrawToday]);

  /*
   * 저금통마다 본 기록을 따로 저장하기 위한 localStorage key다.
   */
  const memoryDrawSeenStorageKey = `memory-draw-seen:${jarId}`;

  /*
   * 버튼 위에 1 배지를 보여줄지 결정한다.
   */
  const showMemoryDrawBadge =
    !!currentMemoryDrawKey && memoryDrawSeenKey !== currentMemoryDrawKey;

  /*
   * Daily Draw 오늘 카드 조회
   */
  const loadDailyDrawToday = useCallback(
    async ({ silent = false } = {}) => {
      if (!jarId) return;

      if (!silent) {
        setDailyDrawLoading(true);
      }

      setDailyDrawError("");

      try {
        const data = await getDailyDrawToday(jarId);
        setDailyDrawToday(data || null);
      } catch (e) {
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "오늘의 추억 한 장을 불러오지 못했어요.";

        setDailyDrawError(serverMessage);
        setDailyDrawToday(null);
      } finally {
        if (!silent) {
          setDailyDrawLoading(false);
        }
      }
    },
    [jarId]
  );

  /*
   * Daily Draw 히스토리 조회
   */
  const loadDailyDrawHistory = useCallback(
    async ({ silent = false } = {}) => {
      if (!jarId) return;

      if (!silent) {
        setDailyDrawLoading(true);
      }

      setDailyDrawError("");

      try {
        const data = await getDailyDrawHistory(jarId, 0, 20);
        const items = Array.isArray(data?.items) ? data.items : [];

        setDailyDrawHistory(items);
      } catch (e) {
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "Daily Draw 기록을 불러오지 못했어요.";

        setDailyDrawError(serverMessage);
        setDailyDrawHistory([]);
      } finally {
        if (!silent) {
          setDailyDrawLoading(false);
        }
      }
    },
    [jarId]
  );

  /*
   * Daily Draw 전체 새로고침
   */
  const refreshDailyDraw = useCallback(async () => {
    setDailyDrawLoading(true);
    setDailyDrawError("");

    try {
      await Promise.all([
        loadDailyDrawToday({ silent: true }),
        loadDailyDrawHistory({ silent: true }),
      ]);
    } finally {
      setDailyDrawLoading(false);
    }
  }, [loadDailyDrawHistory, loadDailyDrawToday]);

  /*
   * 저금통이 열린 상태라면 오늘 카드와 뽑기 기록을 자동으로 불러온다.
   */
  useEffect(() => {
    if (!jarId || !jar) return;

    if (!jar.isOpen) {
      setDailyDrawToday(null);
      setDailyDrawHistory([]);
      setDailyDrawError("");
      setDailyDrawLoading(false);
      return;
    }

    refreshDailyDraw();
  }, [jarId, jar?.isOpen, jar, refreshDailyDraw]);

  /*
   * 페이지에 들어왔을 때, 이 저금통의 추억 쪽지 뽑기 결과를 이미 봤는지 확인한다.
   */
  useEffect(() => {
    if (!jarId) return;

    try {
      const saved = localStorage.getItem(memoryDrawSeenStorageKey);
      setMemoryDrawSeenKey(saved || "");
    } catch {
      setMemoryDrawSeenKey("");
    }
  }, [jarId, memoryDrawSeenStorageKey]);

  /*
   * 추억 쪽지 뽑기 모달을 열었고 현재 뽑힌 결과가 있으면 "봤다"고 저장한다.
   */
  useEffect(() => {
    if (!memoryDrawOpen) return;
    if (!currentMemoryDrawKey) return;

    try {
      localStorage.setItem(memoryDrawSeenStorageKey, currentMemoryDrawKey);
    } catch {
      // localStorage 저장 실패는 화면을 멈출 정도의 문제는 아니므로 넘어간다.
    }

    setMemoryDrawSeenKey(currentMemoryDrawKey);
  }, [memoryDrawOpen, currentMemoryDrawKey, memoryDrawSeenStorageKey]);

  /*
   * 오늘의 추억 한 장 뽑기
   */
  const handleDrawDailyDrawToday = useCallback(async () => {
    if (!jarId) return;

    if (!jar?.isOpen) {
      window.alert("저금통이 열린 뒤에 오늘의 추억 한 장을 뽑을 수 있어요.");
      return;
    }

    setDailyDrawDrawing(true);
    setDailyDrawError("");

    try {
      const data = await drawDailyDrawToday(jarId);

      setDailyDrawToday((prev) => ({
        ...(prev || {}),
        hasTodayDraw: true,
        dailyDraw: data,
        message: data?.newlyDrawn
          ? "오늘의 추억 한 장이 공개되었어요."
          : "이미 공개된 오늘의 추억 한 장을 보여드려요.",
      }));

      await Promise.all([
        loadDailyDrawToday({ silent: true }),
        loadDailyDrawHistory({ silent: true }),
      ]);

      await loadJarZoomNotes();
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "오늘의 추억 한 장 뽑기에 실패했어요.";

      setDailyDrawError(serverMessage);
    } finally {
      setDailyDrawDrawing(false);
    }
  }, [jar?.isOpen, jarId, loadDailyDrawHistory, loadDailyDrawToday, loadJarZoomNotes]);

  return {
    dailyDrawToday,
    setDailyDrawToday,
    dailyDrawHistory,
    dailyDrawLoading,
    dailyDrawDrawing,
    dailyDrawError,
    dailyDrawRealtimeMessage,
    setDailyDrawRealtimeMessage,
    dailyDrawRealtimeMessageTimerRef,
    showMemoryDrawBadge,
    loadDailyDrawToday,
    loadDailyDrawHistory,
    refreshDailyDraw,
    handleDrawDailyDrawToday,
  };
}