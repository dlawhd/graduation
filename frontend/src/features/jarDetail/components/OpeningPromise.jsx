import { buildOpenCalendar } from "../utils/openPromise.mjs";
import { formatJarOpenTime } from "../utils/jarOpenTime.mjs";

/** 저금통의 현재 오픈 시간을 안내하고 개인정보 없는 달력 파일을 기기에 저장한다. */
export default function OpeningPromise({ jar }) {
  const time = formatJarOpenTime(jar.openAt);
  if (!time) return null;
  function download() {
    const url = URL.createObjectURL(new Blob([buildOpenCalendar(jar)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `memoryjar-${jar.jarId}-opening.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="mt-7 w-full max-w-xl rounded-[24px] border border-emerald-100 bg-white/85 p-5 text-left shadow-sm" aria-label="우리의 오픈 약속">
    <h2 className="text-lg font-extrabold text-emerald-950">우리의 오픈 약속</h2>
    <p className="mt-2 text-sm text-slate-600">모두가 같은 시간에 함께 열어요.</p>
    <p className="mt-2 text-sm font-semibold text-slate-700">{time.replace("T", " ")} (한국 시간)</p>
    <button type="button" onClick={download} className="mt-3 min-h-11 rounded-xl border border-emerald-200 bg-white px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-50">캘린더에 추가</button>
  </section>;
}
