package shop.esjh.memoryjar.service.support;

import org.springframework.stereotype.Service;
import java.util.List;

/** 로그인 없이 읽을 수 있는 기본 도움말이다. DB 조회나 AI 호출 없이 고정된 안내만 제공한다. */
@Service
public class SupportFaqService {
    private static final List<Faq> ITEMS=List.of(
        new Faq("upload","PHOTO_UPLOAD","사진을 올리지 못했어요","디자인 원본은 PNG, JPEG, WebP 단일 이미지를 사용해 주세요. HEIC나 움직이는 이미지는 지원하지 않습니다. 문제가 계속되면 사진 없이도 일반 문의를 접수할 수 있어요."),
        new Faq("ai","AI_GENERATION","AI 변환이 실패하거나 결과가 아쉬워요","실패한 후보의 문의 버튼을 이용하면 실패 정보와 원본을 확인해 접수할 수 있어요. 결과 품질 문의는 일반 문의에서 AI 생성·결과 품질을 선택해 주세요. 문의 접수가 자동 재생성이나 성공을 보장하지는 않아요."),
        new Faq("3d","THREE_D","3D에서 사진이 늦게 보이거나 모양이 이상해요","같은 화면에서 2D로 돌아간 뒤 다시 확인해 주세요. 문제가 반복되면 해당 저금통 화면의 도움말·문의 버튼으로 상황을 연결하고, 원하는 경우 화면 캡처를 첨부해 주세요."),
        new Faq("notes","NOTES_CHAT","쪽지나 채팅을 사용할 수 없어요","현재 저금통에 참여 중인지와 공개 상태를 확인해 주세요. 문의 내용에 발생한 순서를 적어 주시면 도움이 돼요. 비공개 쪽지나 대화 내용을 자동으로 수집하지 않아요."),
        new Faq("invite","INVITE_ACCESS","초대 링크로 참여할 수 없어요","초대의 사용 횟수·유효 기간, 저금통 인원과 현재 참여 상태에 따라 참여가 제한될 수 있어요. 새 초대 링크를 요청하거나 일반 문의에서 초대·권한을 선택해 주세요."),
        new Faq("open","USAGE","저금통은 언제 열리나요","저금통 상세 화면에 표시된 공개일과 공개 방식을 확인해 주세요. 공개일과 다르게 보이면 해당 화면에서 문의를 남겨 주세요."),
        new Faq("login","LOGIN_ACCOUNT","로그인할 수 없는데 어떻게 문의하나요","로그인 도움에서는 계정 로그인 없이 접수하고 이 브라우저에서 답변을 확인할 수 있어요. 문의 조회용 쿠키를 삭제하거나 다른 브라우저를 사용하면 기존 문의를 확인할 수 없어요. 비밀번호나 인증번호는 적지 마세요."),
        new Faq("privacy","OTHER","문의 사진과 내용은 얼마나 보관하나요","공유한 사진 사본과 화면 첨부는 최대 30일, 문의 본문과 대화는 최초 접수부터 90일 동안 보관해요. 기한이 지나면 조회를 제한하고 정리 작업이 삭제해요. 접수 번호와 중복 방지 정보는 남을 수 있어요.")
    );
    public List<Faq> items() { return ITEMS; }
    public record Faq(String id,String category,String question,String answer) { }
}
