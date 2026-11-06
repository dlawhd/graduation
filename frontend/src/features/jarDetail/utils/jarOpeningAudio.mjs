/** 클릭한 순간에만 짧은 효과음을 만든다. 외부 음원 요청·자동 재생 없이, 창을 닫으면 음원과 컨텍스트를 정리한다. */
export function createJarOpeningAudio(Context = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context, disposed = false;
  const voices = new Set();
  function stop() {
    for (const voice of voices) { try { voice.stop(); } catch { /* 이미 끝난 음원도 안전하게 정리한다. */ } }
    voices.clear();
  }
  function prepare() {
    if (disposed || !Context) return;
    try { context ||= new Context(); if (context.state === "suspended") context.resume()?.catch(() => {}); } catch { /* 오디오 미지원은 연출을 막지 않는다. */ }
  }
  return {
    // 사용자 클릭 안에서 초기화만 하고 실제 소리는 망치가 닿는 타이머에 맞춰 낸다.
    prepare,
    play(hit) {
      if (disposed || !Context) return;
      try {
        prepare(); if (!context) return;
        const now = context.currentTime;
        const notes = hit === 3 ? [196, 523.25, 659.25] : [180 - hit * 18];
        notes.forEach((frequency, index) => {
          const voice = context.createOscillator(), gain = context.createGain();
          const at = now + index * .045, length = index ? .22 : .11;
          voice.type = "sine"; voice.frequency.setValueAtTime(frequency, at);
          if (!index) voice.frequency.exponentialRampToValueAtTime(72, at + length);
          gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(.065, at + .008);
          gain.gain.exponentialRampToValueAtTime(.0001, at + length);
          voice.connect(gain); gain.connect(context.destination); voices.add(voice);
          voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); };
          voice.start(at); voice.stop(at + length + .015);
        });
      } catch { /* 오디오 미지원·차단은 시각 연출과 추억 보기를 막지 않는다. */ }
    },
    stop,
    close() {
      disposed = true; stop();
      try { context?.close()?.catch(() => {}); } catch { /* 브라우저가 먼저 닫은 경우는 무시한다. */ }
    },
  };
}
