/** 서버의 안정 오류 코드만 화면 안내로 바꾼다. 제공자 메시지나 알 수 없는 문자열은 표시하지 않는다. */
const FAILURE_GUIDANCE = {
  PROVIDER_CONTENT_POLICY_REJECTED: {
    badge: "정책 거절", title: "AI 제공자가 이 요청을 거절했어요",
    message: "AI 제공자의 콘텐츠 정책으로 생성이 거절됐어요. 이 안내만으로 원본이 부적절하다고 단정할 수는 없어요. 원본이나 완성된 후보를 이용하거나, 문제가 계속되면 문의해 주세요.",
  },
  PROVIDER_INPUT_INVALID: {
    badge: "요청 확인", title: "생성 요청을 처리할 수 없어요",
    message: "AI 제공자가 이미지 또는 생성 설정을 유효한 입력으로 처리하지 못했어요. 같은 요청을 반복하기보다 원본을 확인하고, 문제가 계속되면 문의해 주세요.",
  },
  PROVIDER_QUOTA_EXCEEDED: {
    badge: "사용량 한도", title: "AI 서비스 사용량 한도에 도달했어요",
    message: "지금 같은 요청을 반복해도 해결되지 않을 수 있어요. 원본이나 완성된 후보를 이용하고, AI 생성은 나중에 다시 확인해 주세요.",
  },
  PROVIDER_CAPACITY_EXCEEDED: {
    badge: "잠시 후 시도", title: "AI 서비스가 잠시 혼잡해요",
    message: "AI 제공자의 처리 용량이 일시적으로 부족해요. 잠시 기다린 뒤 원할 때 다시 시도해 주세요.", canRetry: true,
  },
  PROVIDER_CONFIGURATION_UNAVAILABLE: {
    badge: "서비스 확인", title: "AI 생성 서비스 설정을 확인하고 있어요",
    message: "서비스 설정 문제로 생성을 시작하지 못했어요. 반복 요청보다는 원본이나 완성된 후보를 이용하고, 문제가 계속되면 문의해 주세요.",
  },
  PROVIDER_TIMEOUT: {
    badge: "시간 초과", title: "AI 응답을 제시간에 받지 못했어요",
    message: "AI 제공자의 응답 시간이 초과됐어요. 잠시 후 원할 때 다시 시도해 주세요.", canRetry: true,
  },
  PROVIDER_RATE_LIMITED: {
    badge: "요청 제한", title: "AI 제공자가 요청을 제한했어요",
    message: "요청 수 또는 사용량 제한이 있을 수 있어요. 연속 요청은 피하고 나중에 다시 확인해 주세요.",
  },
  PROVIDER_INVALID_RESPONSE: {
    badge: "결과 확인", title: "사용할 수 있는 AI 이미지를 받지 못했어요",
    message: "AI 응답 또는 이미지가 저장 규격을 충족하지 못했어요. 원본이나 완성된 후보는 이용할 수 있어요. 반복되면 문의해 주세요.",
  },
  CANDIDATE_CONTENT_POLICY_REJECTED: {
    badge: "심사 거절", title: "생성된 후보가 콘텐츠 심사를 통과하지 못했어요",
    message: "AI가 만든 결과 이미지가 콘텐츠 심사에서 거절됐어요. 원본이 거절됐다는 뜻은 아니며, 원본이나 이미 완성된 후보는 이용할 수 있어요.",
  },
  CANDIDATE_MODERATION_UNAVAILABLE: {
    badge: "심사 지연", title: "생성된 후보의 심사를 완료하지 못했어요",
    message: "콘텐츠 심사 서비스에 일시적인 문제가 있어 후보를 저장하지 않았어요. 이미지가 정책 위반으로 판정된 것은 아니에요. 잠시 후 원할 때 다시 시도해 주세요.", canRetry: true,
  },
  SOURCE_IMAGE_LOAD_FAILED: {
    badge: "원본 확인", title: "서버에서 원본을 읽지 못했어요",
    message: "원본 파일을 불러오지 못해 생성하지 못했어요. 새로고침으로 상태를 확인하고, 문제가 계속되면 원본을 다시 불러오거나 문의해 주세요.",
  },
  PIXEL_POSTPROCESS_FAILED: {
    badge: "픽셀 변환 실패", title: "픽셀 후보를 변환하지 못했어요",
    message: "생성 결과의 픽셀 후처리를 완료하지 못했어요. 원본이나 완성된 후보는 이용할 수 있어요. 문제가 계속되면 문의해 주세요.",
  },
  S3_UPLOAD_FAILED: {
    badge: "저장 실패", title: "후보 이미지를 저장하지 못했어요",
    message: "이미지 저장을 완료하지 못했어요. 원본과 기존 후보는 그대로 유지돼요. 잠시 후 원할 때 다시 시도해 주세요.", canRetry: true,
  },
  GENERATION_QUEUE_FULL: {
    badge: "잠시 후 시도", title: "AI 생성 대기열이 가득 찼어요",
    message: "서비스에 생성 요청이 몰렸어요. 잠시 기다린 뒤 원할 때 다시 시도해 주세요.", canRetry: true,
  },
  GENERATION_TIMEOUT: {
    badge: "시간 초과", title: "생성 작업의 제한 시간이 지났어요",
    message: "대기 또는 처리 시간이 길어져 이번 작업을 종료했어요. 잠시 후 원할 때 다시 시도해 주세요.", canRetry: true,
  },
};
const UNKNOWN_FAILURE = {
  badge: "생성 실패", title: "이번 후보를 완성하지 못했어요",
  message: "정확한 실패 사유를 확인하지 못했어요. 원본이나 완성된 후보는 이용할 수 있어요. 문제가 계속되면 아래 확인 코드를 알려 주세요.",
};

/** 기존 일반 오류·새 서버 코드도 안전하게 처리하며, 실패 안내는 FAILED 카드에만 사용한다. */
export function getGenerationFailureGuidance(errorCode) {
  const known = typeof errorCode === "string" && Object.hasOwn(FAILURE_GUIDANCE, errorCode);
  const guidance = known ? FAILURE_GUIDANCE[errorCode] : UNKNOWN_FAILURE;
  return { ...guidance, canRetry: guidance.canRetry === true,
    diagnosticCode: known || errorCode === "PROVIDER_REQUEST_FAILED" || errorCode === "INTERNAL_ERROR"
      ? errorCode : "UNKNOWN_ERROR" };
}
