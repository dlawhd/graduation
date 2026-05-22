package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.dto.note.response.NoteReactionCountItem;
import shop.esjh.memoryjar.dto.note.response.NoteReactionSummaryResponse;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteReaction;
import shop.esjh.memoryjar.enums.note.NoteReactionEmoji;
import shop.esjh.memoryjar.model.notification.NotificationPayload;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.repository.note.NoteReactionRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
import shop.esjh.memoryjar.service.jar.JarOpenService;
import shop.esjh.memoryjar.service.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/*
 * 쉽게 말하면:
 * 1) 사용자가 쪽지에 리액션을 누르면 저장하고
 * 2) 같은 리액션을 다시 누르면 취소하고
 * 3) 다른 리액션을 누르면 기존 리액션을 바꾸고
 * 4) 최종적으로 현재 리액션 요약 상태를 만들어서 돌려주는 역할

 * 이 서비스는 컨트롤러에서 받은 Request DTO를 직접 받지 않고,
 * 진짜 필요한 값(현재 사용자 id, jarId, noteId, emoji)만 받아서 처리

 * 왜 이렇게 하냐면?
 * - 서비스가 웹 요청 형식에 덜 묶이고 테스트하기 쉬워지고 나중에 다른 곳에서도 재사용하기 쉬워지기 때문
 */
@Service
@Transactional(readOnly = true)
public class NoteReactionService {

    private final NoteReactionRepository noteReactionRepository;
    private final NoteRepository noteRepository;
    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final UserRepository userRepository;
    private final JarOpenService jarOpenService;
    private final NotificationService notificationService;
    private final NoteRealtimeService noteRealtimeService;

    public NoteReactionService(
            NoteReactionRepository noteReactionRepository,
            NoteRepository noteRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository,
            JarOpenService jarOpenService,
            NotificationService notificationService,
            NoteRealtimeService noteRealtimeService
    ) {
        this.noteReactionRepository = noteReactionRepository;
        this.noteRepository = noteRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
        this.jarOpenService = jarOpenService;
        this.notificationService = notificationService;
        this.noteRealtimeService = noteRealtimeService;
    }

    /*
     * 리액션 등록 / 변경 / 같은 값이면 취소까지 한 번에 처리하는 메서드
     *
     * 동작 규칙:
     * - 아직 리액션이 없으면 새로 저장
     * - 같은 리액션을 다시 누르면 삭제
     * - 다른 리액션을 누르면 기존 값을 변경
     */
    @Transactional
    public NoteReactionSummaryResponse react(
            Long currentUserId,
            Long jarId,
            Long noteId,
            NoteReactionEmoji emoji
    ) {

        // 1. 현재 사용자 확인
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        Jar jar = getJarOrThrow(jarId);

        // 3. 현재 사용자가 이 저금통의 active 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 리액션을 남길 수 있어.");

        // 4. 저금통이 오픈됐는지 확인
        validateJarOpen(jar);

        // 5. 이 저금통 안의 쪽지인지 확인
        Note note = getNoteOrThrow(jarId, noteId);

        // 5-1. 알림에 담아둘 추가 정보 만들기
        NotificationPayload payload = new NotificationPayload(
                jarId,
                noteId,
                null,
                currentUser.getId(),
                currentUser.getName(),
                emoji.name()
        );

        // 6. 내가 이미 이 쪽지에 남긴 리액션이 있는지 확인
        NoteReaction existingReaction = noteReactionRepository
                .findByNote_NoteIdAndUser_Id(noteId, currentUserId)
                .orElse(null);

        // 7. 기존 리액션이 없으면 새로 저장
        if (existingReaction == null) {
            NoteReaction newReaction = NoteReaction.builder()
                    .note(note)
                    .user(currentUser)
                    .emoji(emoji)
                    .build();

            noteReactionRepository.save(newReaction);
            noteReactionRepository.flush();

            // 내가 내 글에 반응한 건 알림 보내지 않기
            if (!note.getAuthor().getId().equals(currentUser.getId())) {
                notificationService.notifyNoteReacted(
                        note.getAuthor(),
                        jar,
                        payload
                );
            }

            NoteReactionSummaryResponse summary = buildSummary(noteId, emoji);

            noteRealtimeService.sendNoteEventAfterCommit(
                    jarId,
                    noteId,
                    NoteRealtimeEventResponse.reactionChanged(
                            jarId,
                            noteId,
                            currentUser.getId(),
                            currentUser.getName()
                    )
            );

            return summary;
        }

        // 8. 같은 리액션을 다시 누르면 취소(삭제)
        if (existingReaction.getEmoji() == emoji) {
            // 8-1. 기존 리액션 삭제
            noteReactionRepository.delete(existingReaction);

            // 8-2. DB에 삭제 내용을 바로 반영
            noteReactionRepository.flush();

            // 8-3.  삭제 후 최신 리액션 요약 만들기
            NoteReactionSummaryResponse summary = buildSummary(noteId, null);

            // 8-4. 다른 사용자 화면에도 "리액션 상태가 바뀌었어!"라고 알려주기
            noteRealtimeService.sendNoteEventAfterCommit(
                    jarId,
                    noteId,
                    NoteRealtimeEventResponse.reactionChanged(
                            jarId,
                            noteId,
                            currentUser.getId(),
                            currentUser.getName()
                    )
            );

            // 8-5. 요청한 사용자에게도 최신 요약 반환
            return summary;
        }

        // 9. 다른 리액션이면 기존 값을 새 값으로 변경
        existingReaction.changeEmoji(emoji);
        noteReactionRepository.flush();

        // 내가 내 글에 반응한 건 알림 보내지 않기
        if (!note.getAuthor().getId().equals(currentUser.getId())) {
            notificationService.notifyNoteReacted(
                    note.getAuthor(),
                    jar,
                    payload
            );
        }

        NoteReactionSummaryResponse summary = buildSummary(noteId, emoji);

        noteRealtimeService.sendNoteEventAfterCommit(
                jarId,
                noteId,
                NoteRealtimeEventResponse.reactionChanged(
                        jarId,
                        noteId,
                        currentUser.getId(),
                        currentUser.getName()
                )
        );

        return summary;
    }

    /*
     * 내가 누른 리액션을 삭제하는 메서드
     *
     * DELETE API에서 사용할 수 있음.
     * 이미 리액션이 없어도 에러를 내지 않고 현재 상태를 그대로 돌려준다.
     */
    @Transactional
    public NoteReactionSummaryResponse deleteMyReaction(
            Long currentUserId,
            Long jarId,
            Long noteId
    ) {
        // 1. 현재 사용자 확인
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        Jar jar = getJarOrThrow(jarId);

        // 3. 현재 사용자가 이 저금통의 active 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 리액션을 삭제할 수 있어.");

        // 4. 저금통이 오픈됐는지 확인
        validateJarOpen(jar);

        // 5. 이 저금통 안의 쪽지인지 확인
        getNoteOrThrow(jarId, noteId);

        // 6. 내가 누른 리액션 조회
        NoteReaction existingReaction = noteReactionRepository
                .findByNote_NoteIdAndUser_Id(noteId, currentUserId)
                .orElse(null);

        // 7. 리액션이 있으면 삭제
        if (existingReaction != null) {
            noteReactionRepository.delete(existingReaction);
            noteReactionRepository.flush();

            // 8. 실제로 삭제가 일어났을 때만 WebSocket 이벤트 보내기
            noteRealtimeService.sendNoteEventAfterCommit(
                    jarId,
                    noteId,
                    NoteRealtimeEventResponse.reactionChanged(
                            jarId,
                            noteId,
                            currentUser.getId(),
                            currentUser.getName()
                    )
            );
        }

        // 9. 최신 리액션 요약 반환
        return buildSummary(noteId, null);
    }

    /*
     * 쪽지 1개의 리액션 요약을 가져오는 메서드

     * 상세 화면에서
     * - 내가 누른 리액션이 무엇인지
     * - 각 리액션이 몇 개인지
     * 보여줄 때 사용하면 됌
     */
    public NoteReactionSummaryResponse getSummary(
            Long currentUserId,
            Long jarId,
            Long noteId
    ) {

        // 1. 접근 가능한 쪽지인지 확인
        getUserOrThrow(currentUserId);
        Jar jar = getJarOrThrow(jarId);
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 리액션 정보를 볼 수 있어.");
        validateJarOpen(jar);
        getNoteOrThrow(jarId, noteId);

        // 2. 내가 누른 리액션 조회
        NoteReactionEmoji myReaction = noteReactionRepository
                .findByNote_NoteIdAndUser_Id(noteId, currentUserId)
                .map(NoteReaction::getEmoji)
                .orElse(null);

        // 3. 전체 요약 만들기
        return buildSummary(noteId, myReaction);
    }

    /*
     * 여러 쪽지의 리액션 개수를 한 번에 가져오는 메서드

     * 이건 쪽지 목록 화면에서 유용함
     * 카드가 여러 개 있을 때 쪽지마다 따로 조회하지 않고 한 번에 묶어서 개수만 가져올 수 있음

     * 반환 예시:
     * - 10번 쪽지 -> [LOVE 2개, SMILE 1개]
     * - 11번 쪽지 -> [CHEER 3개]
     */
    public Map<Long, List<NoteReactionCountItem>> getCountMapByNoteIds(List<Long> noteIds) {

        // noteId가 없으면 바로 빈 맵 반환
        if (noteIds == null || noteIds.isEmpty()) {
            return Map.of();
        }

        // DB에서 여러 쪽지의 리액션 개수를 한 번에 가져옴
        List<NoteReactionRepository.ReactionCountView> rows =
                noteReactionRepository.countGroupedByNoteIds(noteIds);

        // noteId별로 count를 임시 저장할 맵
        Map<Long, EnumMap<NoteReactionEmoji, Long>> tempMap = new LinkedHashMap<>();

        for (NoteReactionRepository.ReactionCountView row : rows) {
            tempMap
                    .computeIfAbsent(row.getNoteId(), key -> new EnumMap<>(NoteReactionEmoji.class))
                    .put(row.getEmoji(), row.getCount());
        }

        // 프론트가 쓰기 좋은 DTO 리스트 형태로 변환
        Map<Long, List<NoteReactionCountItem>> result = new LinkedHashMap<>();

        for (Long noteId : noteIds) {
            EnumMap<NoteReactionEmoji, Long> countMap =
                    tempMap.getOrDefault(noteId, new EnumMap<>(NoteReactionEmoji.class));

            result.put(noteId, toCountItems(countMap));
        }

        return result;
    }

    /*
     * 여러 쪽지에 대해 "내가 누른 리액션"을 한 번에 가져오는 메서드

     * 왜 필요하냐면?
     * 목록 카드에서
     * - LOVE 버튼이 내가 누른 버튼인지
     * - THANKFUL 버튼이 내가 누른 버튼인지
     * 강조해서 보여주고 싶기 때문

     * 반환 예시:
     * - 10번 쪽지 -> LOVE
     * - 11번 쪽지 -> null(안 눌렀음)
     * - 12번 쪽지 -> THANKFUL
     */
    public Map<Long, NoteReactionEmoji> getMyReactionMapByNoteIds(
            Long currentUserId,
            List<Long> noteIds
    ) {

        // 쪽지가 없으면 바로 빈 맵 반환
        if (noteIds == null || noteIds.isEmpty()) {
            return Map.of();
        }

        // DB에서 "내가 누른 리액션"만 한 번에 가져옴
        List<NoteReactionRepository.MyReactionView> rows =
                noteReactionRepository.findMyReactionsByUserIdAndNoteIds(currentUserId, noteIds);

        // noteId -> 내가 누른 emoji 형태로 바꿔서 반환
        Map<Long, NoteReactionEmoji> result = new LinkedHashMap<>();

        for (NoteReactionRepository.MyReactionView row : rows) {
            result.put(row.getNoteId(), row.getEmoji());
        }

        return result;
    }

    /*
     * 쪽지 1개의 최신 리액션 요약을 만드는 내부 함수

     * 여러 서비스 메서드에서 공통으로 사용하니까 따로 빼두면 코드가 더 짧고 읽기 쉬움
     */
    private NoteReactionSummaryResponse buildSummary(Long noteId, NoteReactionEmoji myReaction) {
        List<NoteReactionRepository.ReactionCountView> rows =
                noteReactionRepository.countGroupedByNoteId(noteId);

        EnumMap<NoteReactionEmoji, Long> countMap = new EnumMap<>(NoteReactionEmoji.class);

        for (NoteReactionRepository.ReactionCountView row : rows) {
            countMap.put(row.getEmoji(), row.getCount());
        }

        return new NoteReactionSummaryResponse(
                noteId,
                myReaction,
                toCountItems(countMap)
        );
    }

    /*
     * EnumMap 형태의 개수 데이터를 프론트가 받기 쉬운 DTO 리스트로 바꿔주는 함수

     * 여기서는 enum 선언 순서대로 돌기 때문에
     * LOVE, SMILE, LAUGH ... 순서를 일정하게 유지할 수 있음
     *
     * count가 0인 건 굳이 내려줄 필요가 없어서 제외함
     */
    private List<NoteReactionCountItem> toCountItems(EnumMap<NoteReactionEmoji, Long> countMap) {
        List<NoteReactionCountItem> items = new ArrayList<>();

        for (NoteReactionEmoji emoji : NoteReactionEmoji.values()) {
            long count = countMap.getOrDefault(emoji, 0L);

            if (count > 0) {
                items.add(new NoteReactionCountItem(emoji, count));
            }
        }

        return items;
    }

    /*
     * 현재 사용자 찾기
     * 없으면 404 예외를 던짐
     */
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어."
                ));
    }

    /*
     * 저금통 찾기
     * 없으면 404 예외를 던짐
     */
    private Jar getJarOrThrow(Long jarId) {
        return jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));
    }

    /*
     * 현재 사용자가 이 저금통의 active 멤버인지 확인함
     * 아니면 403 예외를 던짐
     */
    private void validateActiveMember(Long jarId, Long currentUserId, String message) {
        boolean isActiveMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!isActiveMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    /*
     * 이 쪽지가 정말 이 저금통 안에 속한 쪽지인지 확인함
     * 아니면 404 예외를 던짐
     */
    private Note getNoteOrThrow(Long jarId, Long noteId) {
        return noteRepository.findByJarIdAndNoteId(jarId, noteId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "쪽지를 찾을 수 없어."
                ));
    }

    /*
     * 저금통이 오픈 상태인지 확인함
     * 아직 안 열렸다면 리액션은 남길 수 없게 막음
     */
    private void validateJarOpen(Jar jar) {
        boolean isOpen = jarOpenService.ensureOpenedIfDue(jar.getJarId());

        if (!isOpen) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "저금통이 열리고 나서 리액션을 남길 수 있어."
            );
        }
    }
}