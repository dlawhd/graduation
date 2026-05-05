package com.example.demo.service.jar;

import com.example.demo.dto.dailydraw.response.*;
import com.example.demo.dto.note.response.NoteAttachmentResponse;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarDailyDraw;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteAttachment;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.repository.jar.JarDailyDrawRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteAttachmentRepository;
import com.example.demo.repository.note.NoteRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Service
@Transactional(readOnly = true)
public class JarDailyDrawService {

    // 우리 서비스의 날짜 기준은 한국 시간이다.
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    // 한 페이지에서 너무 많은 히스토리를 가져오지 못하게 제한한다.
    private static final int MAX_HISTORY_SIZE = 100;

    // 프론트가 "오늘의 추억 한 장이 공개됐구나!" 하고 구분할 이벤트 이름
    private static final String DAILY_DRAW_REVEALED = "DAILY_DRAW_REVEALED";

    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final JarDailyDrawRepository jarDailyDrawRepository;
    private final NoteRepository noteRepository;
    private final NoteAttachmentRepository noteAttachmentRepository;
    private final JarOpenService jarOpenService;
    private final JarDailyDrawRealtimeService jarDailyDrawRealtimeService;

    public JarDailyDrawService(
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            JarDailyDrawRepository jarDailyDrawRepository,
            NoteRepository noteRepository,
            NoteAttachmentRepository noteAttachmentRepository,
            JarOpenService jarOpenService,
            JarDailyDrawRealtimeService jarDailyDrawRealtimeService
    ) {
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.jarDailyDrawRepository = jarDailyDrawRepository;
        this.noteRepository = noteRepository;
        this.noteAttachmentRepository = noteAttachmentRepository;
        this.jarOpenService = jarOpenService;
        this.jarDailyDrawRealtimeService = jarDailyDrawRealtimeService;
    }

    // 오늘의 추억 한 장 뽑기
    // POST /api/v1/jars/{jarId}/daily-draw 에서 사용할 메서드다.
    @Transactional
    public DailyDrawResponse drawToday(Long currentUserId, Long jarId) {

        // 1. 저금통이 실제로 존재하는지 먼저 확인한다.
        Jar jar = getJarOrThrow(jarId);

        // 2. 현재 사용자가 이 저금통의 active 멤버인지 확인한다.
        validateActiveMember(jarId, currentUserId);

        // 3. Daily Draw 방식 저금통인지 확인한다.
        validateDailyDrawMode(jar);

        // 4. 저금통이 열렸는지 확인한다.
        // 오픈 시간이 지났는데 스케줄러가 아직 처리하지 못했다면 여기서 바로 열림 처리까지 시도한다.
        validateOpened(jarId);

        /*
         * 5. 저금통 row를 잠금 조회한다.
         *
         * 왜 잠그냐면?
         * - A와 B가 동시에 "오늘 카드 뽑기" 버튼을 누를 수 있다.
         * - 둘 다 동시에 후보를 고르면 하루에 2장이 생길 위험이 있다.
         * - 그래서 같은 jarId에 대해서는 한 명씩 순서대로 처리되게 잠근다.
         */
        Jar lockedJar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 6. 한국 날짜 기준 오늘을 구한다.
        LocalDate today = todayKst();

        // 7. 오늘 이미 뽑힌 카드가 있으면 새로 뽑지 않는다.
        return jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(jarId, today)
                .map(existingDraw -> toDailyDrawResponse(existingDraw, false))
                .orElseGet(() -> createNewDailyDraw(lockedJar, today));
    }

    // 오늘 뽑힌 카드 조회
    // GET /api/v1/jars/{jarId}/daily-draw/today 에서 사용할 메서드
    public DailyDrawTodayResponse getTodayDraw(Long currentUserId, Long jarId) {

        // 1. 저금통 확인
        Jar jar = getJarOrThrow(jarId);

        // 2. 멤버인지 확인
        validateActiveMember(jarId, currentUserId);

        // 3. DAILY_DRAW 모드인지 확인
        validateDailyDrawMode(jar);

        // 4. 열린 저금통인지 확인
        validateOpened(jarId);

        // 5. 한국 날짜 기준 오늘 카드 조회
        LocalDate today = todayKst();

        return jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(jarId, today)
                .map(draw -> DailyDrawTodayResponse.found(toDailyDrawResponse(draw, false)))
                .orElseGet(DailyDrawTodayResponse::empty);
    }

    // 지난 날짜에 어떤 쪽지가 뽑혔는지 목록으로 보여준다.
    // GET /api/v1/jars/{jarId}/daily-draw/history 에서 사용할 메서드
    public DailyDrawHistoryResponse getHistory(
            Long currentUserId,
            Long jarId,
            int page,
            int size
    ) {

        // 1. 저금통 확인
        Jar jar = getJarOrThrow(jarId);

        // 2. 멤버인지 확인
        validateActiveMember(jarId, currentUserId);

        // 3. DAILY_DRAW 모드인지 확인
        validateDailyDrawMode(jar);

        // 4. 열린 저금통인지 확인
        validateOpened(jarId);

        // 5. page, size 값이 너무 이상하게 들어오지 않도록 안전하게 보정한다.
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_HISTORY_SIZE);

        Pageable pageable = PageRequest.of(safePage, safeSize);

        // 6. Daily Draw 기록을 최신 날짜순으로 조회한다.
        Page<JarDailyDraw> historyPage = jarDailyDrawRepository.findHistoryByJarId(jarId, pageable);

        // 7. 목록 아이템 DTO로 변환한다.
        List<DailyDrawHistoryItem> items = historyPage.getContent()
                .stream()
                .map(this::toHistoryItem)
                .toList();

        return new DailyDrawHistoryResponse(
                items,
                historyPage.getNumber(),
                historyPage.getSize(),
                historyPage.getTotalElements(),
                historyPage.getTotalPages()
        );
    }

    //  새 Daily Draw 기록 생성
    //  오늘 카드가 아직 없을 때만 호출된다.
    private DailyDrawResponse createNewDailyDraw(Jar lockedJar, LocalDate today) {
        Long jarId = lockedJar.getJarId();

        /*
         * 1. 아직 뽑히지 않은 후보 쪽지 개수를 센다.
         *
         * NoteRepository의 countDailyDrawCandidatesByJarId()는
         * jar_daily_draws에 이미 기록된 쪽지를 제외하고 센다.
         *
         * 즉:
         * - 이미 뽑힌 쪽지 = 후보 제외
         * - 아직 안 뽑힌 쪽지 = 후보 포함
         */
        long candidateCount = noteRepository.countDailyDrawCandidatesByJarId(jarId);

        // 후보가 0장이면 더 이상 뽑을 수 없다.
        if (candidateCount <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "아직 뽑을 수 있는 추억 쪽지가 없어."
            );
        }

        /*
         * 2. 후보 개수 안에서 랜덤 위치를 하나 고른다.
         *
         * 예:
         * - 후보가 5장이라면 0, 1, 2, 3, 4 중 하나를 뽑는다.
         */
        int randomOffset = ThreadLocalRandom.current().nextInt(Math.toIntExact(candidateCount));

        /*
         * 3. 랜덤 위치에 해당하는 쪽지 1장을 가져온다.
         *
         * PageRequest.of(randomOffset, 1)의 의미:
         * - randomOffset 번째 페이지
         * - 한 페이지에 1개만
         *
         * 결과적으로 후보 중 랜덤 위치의 쪽지 1장만 가져오게 된다.
         */
        Pageable oneRandomNotePage = PageRequest.of(randomOffset, 1);

        Note selectedNote = noteRepository.findDailyDrawCandidatesByJarId(jarId, oneRandomNotePage)
                .getContent()
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "뽑을 수 있는 추억 쪽지를 찾지 못했어."
                ));

        /*
         * 4. 오늘 뽑힌 결과를 엔티티로 만든다.
         * 여기서 selectedNote는 이미 "한 번도 뽑히지 않은 쪽지"다.
         */
        JarDailyDraw dailyDraw = JarDailyDraw.create(
                lockedJar,
                selectedNote,
                today
        );

        /*
         * 5. DB에 저장한다.
         *
         * saveAndFlush를 쓰는 이유:
         * - UNIQUE 제약 위반 같은 DB 오류가 있다면 이 시점에 바로 확인하기 위해서다.
         *
         * 다만 위에서 저금통 row를 잠갔기 때문에
         * 정상 흐름에서는 같은 날짜 중복 저장이 거의 발생하지 않는다.
         */
        JarDailyDraw savedDraw = jarDailyDrawRepository.saveAndFlush(dailyDraw);

        // 6. 새로 뽑힌 카드이므로 newlyDrawn = true 응답을 만든다.
        DailyDrawResponse response = toDailyDrawResponse(savedDraw, true);

        /*
         * 7. 오늘 처음 뽑힌 경우에만 WebSocket 이벤트를 보낸다.
         *
         * 이 메서드(createNewDailyDraw)는
         * "오늘 카드가 아직 없어서 새로 저장할 때만" 호출된다.
         *
         * 그래서 여기서 이벤트를 보내면:
         * - 오늘 이미 뽑힌 카드 조회: 이벤트 안 보냄
         * - 오늘 처음 뽑힌 카드 저장: 이벤트 보냄
         *
         * 즉, 다른 멤버 화면에 "오늘의 추억 한 장이 공개됐어!"를
         * 새로고침 없이 알려줄 수 있다.
         */
        jarDailyDrawRealtimeService.sendDailyDrawEventAfterCommit(
                jarId,
                toDailyDrawSocketEventResponse(savedDraw)
        );

        return response;
    }

    // 저금통 조회 공통 메서드
    private Jar getJarOrThrow(Long jarId) {
        return jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));
    }

    // 현재 사용자가 active 멤버인지 확인한다.
    private void validateActiveMember(Long jarId, Long currentUserId) {
        boolean activeMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!activeMember) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "현재 저금통 멤버만 오늘의 추억 한 장을 볼 수 있어."
            );
        }
    }

    /*
     * DAILY_DRAW 방식 저금통인지 확인한다.
     *
     * ALL_AT_ONCE 저금통은 오픈되면 전체 쪽지를 한 번에 보는 방식이라서
     * Daily Draw 기능을 사용할 수 없다.
     */
    private void validateDailyDrawMode(Jar jar) {
        if (jar.getOpenMode() != JarOpenMode.DAILY_DRAW) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "DAILY_DRAW 방식 저금통에서만 오늘의 추억 한 장을 사용할 수 있어."
            );
        }
    }

    /*
     * 저금통이 열렸는지 확인한다.
     *
     * ensureOpenedIfDue(jarId)를 쓰는 이유:
     * - 스케줄러가 아직 못 열었더라도
     * - 오픈 시간이 이미 지났다면 사용자가 접근한 순간 바로 열림 처리할 수 있다.
     */
    private void validateOpened(Long jarId) {
        boolean opened = jarOpenService.ensureOpenedIfDue(jarId);

        if (!opened) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "아직 열리지 않은 저금통이야. 오픈 이후에 오늘의 추억 한 장을 사용할 수 있어."
            );
        }
    }

    /*
     * 한국 시간 기준 오늘 날짜를 구한다.
     *
     * Daily Draw는 "하루에 한 장" 기능이기 때문에
     * 서버 기준 날짜가 아니라 서비스 기준 날짜를 명확히 해야 한다.
     */
    private LocalDate todayKst() {
        return LocalDate.now(KST);
    }

    // DailyDraw 엔티티를 뽑기 결과 응답 DTO로 바꾼다.
    private DailyDrawResponse toDailyDrawResponse(
            JarDailyDraw dailyDraw,
            boolean newlyDrawn
    ) {
        return new DailyDrawResponse(
                dailyDraw.getDrawId(),
                dailyDraw.getJar().getJarId(),
                dailyDraw.getDrawDate(),
                newlyDrawn,
                toDailyDrawNoteResponse(dailyDraw.getNote())
        );
    }

    // DailyDraw 히스토리 한 줄 DTO로 바꾼다.
    private DailyDrawHistoryItem toHistoryItem(JarDailyDraw dailyDraw) {
        Note note = dailyDraw.getNote();

        return new DailyDrawHistoryItem(
                dailyDraw.getDrawId(),
                dailyDraw.getJar().getJarId(),
                dailyDraw.getDrawDate(),
                note.getNoteId(),
                note.getTitle(),
                note.getAuthor().getId(),
                note.getAuthor().getName(),
                note.getNoteDate(),
                note.getLocation()
        );
    }

    /*
     * 뽑힌 쪽지 정보를 DailyDrawNoteResponse로 바꾼다.
     * 첨부파일도 같이 내려줘야 프론트에서 오늘 카드에 이미지/영상 등을 보여줄 수 있다.
     */
    private DailyDrawNoteResponse toDailyDrawNoteResponse(Note note) {
        List<NoteAttachmentResponse> attachments = noteAttachmentRepository
                .findAllByNote_NoteIdOrderBySortOrderAsc(note.getNoteId())
                .stream()
                .map(this::toAttachmentResponse)
                .toList();

        return new DailyDrawNoteResponse(
                note.getNoteId(),
                note.getJar().getJarId(),
                note.getAuthor().getId(),
                note.getAuthor().getName(),
                note.getTitle(),
                note.getContent(),
                note.isEncrypted(),
                note.getNoteDate(),
                note.getLocation(),
                note.getTags(),
                attachments,
                toKstOffsetDateTime(note.getCreatedAt()),
                toKstOffsetDateTime(note.getUpdatedAt())
        );
    }

    // NoteAttachment 엔티티를 기존 NoteAttachmentResponse DTO로 바꾼다.
    private NoteAttachmentResponse toAttachmentResponse(NoteAttachment attachment) {
        return new NoteAttachmentResponse(
                attachment.getId(),
                attachment.getSortOrder(),
                attachment.getS3Key(),
                attachment.getUrl(),
                attachment.getThumbnailUrl(),
                attachment.getContentType(),
                attachment.getSize()
        );
    }

    /*
     * DB에 저장된 LocalDateTime을 프론트 응답용 OffsetDateTime(+09:00)으로 바꾼다.
     *
     * 우리 DB의 LocalDateTime은 한국 시간 벽시계값이라고 보고,
     * 응답에는 +09:00 정보가 붙은 시간으로 내려준다.
     */
    private OffsetDateTime toKstOffsetDateTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }

        return localDateTime
                .atZone(KST)
                .toOffsetDateTime();
    }

    /*
     * Daily Draw 엔티티를 WebSocket 이벤트 응답 DTO로 바꾼다.
     *
     * 여기서는 쪽지 본문(content)을 바로 보내지 않는다.
     * 이유:
     * - WebSocket 이벤트는 "오늘 카드가 뽑혔어!"라는 알림 역할만 한다.
     * - 실제 카드 내용은 프론트가 기존 REST API로 다시 조회한다.
     *
     * 이렇게 하면 기존 권한 검증 로직을 그대로 재사용할 수 있어서 더 안전하다.
     */
    private DailyDrawSocketEventResponse toDailyDrawSocketEventResponse(JarDailyDraw dailyDraw) {
        return new DailyDrawSocketEventResponse(
                dailyDraw.getJar().getJarId(),
                DAILY_DRAW_REVEALED,
                dailyDraw.getDrawId(),
                dailyDraw.getDrawDate(),
                dailyDraw.getNote().getNoteId(),
                "오늘의 추억 한 장이 공개되었어요."
        );
    }

}