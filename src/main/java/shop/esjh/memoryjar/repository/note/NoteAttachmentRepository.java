package shop.esjh.memoryjar.repository.note;

import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteAttachmentRepository extends JpaRepository<NoteAttachment, Long> {

    // note 1번에 사진 3개가 있으면 sortOrder 0, 1, 2 순서대로 가져옴
    List<NoteAttachment> findAllByNoteOrderBySortOrderAsc(Note note);

    // 특정 noteId에 속한 첨부파일들을 순서대로 조회함
    // Note 엔티티 자체를 넘기지 않고 noteId(Long)만으로도 조회할 수 있게 준비함
    // 상황에 따라 서비스 코드에서 note 객체가 없을 수도 있어서 이렇게 id 기준 메서드도 하나 있으면 편함
    List<NoteAttachment> findAllByNote_NoteIdOrderBySortOrderAsc(Long noteId);

    // 특정 쪽지 안에서 가장 마지막 순서의 첨부파일 1개를 조회함
    // 왜 필요하냐면? 새 첨부파일을 추가할 때 현재 마지막 번호가 몇 번인지" 확인하고 그 다음 번호를 붙일 수 있음
    // 예: 기존 sortOrder가 0,1,2 면 마지막 값 2를 찾아서 새 파일은 3으로 넣는 식
    Optional<NoteAttachment> findTopByNoteOrderBySortOrderDesc(Note note);

    // 특정 noteId 기준으로 마지막 순서 첨부파일 1개를 조회. noteId(Long) 기준으로 바로 조회하고 싶을 때 사용함
    Optional<NoteAttachment> findTopByNote_NoteIdOrderBySortOrderDesc(Long noteId);

    // 여러 noteId의 첨부파일을 한 번에 조회
    List<NoteAttachment> findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc(List<Long> noteIds);

    // 특정 S3 key를 가진 첨부파일이 이미 존재하는지 확인
    // 왜 필요하냐면? 같은 s3Key를 중복 저장하려는 실수를 서비스 단에서 한 번 더 막을 수 있음
    // DB에도 UNIQUE 제약이 있지만, 저장 전에 미리 체크하면 에러를 더 예쁘게 처리하기 쉬움
    boolean existsByS3Key(String s3Key);

    // 특정 S3 key로 첨부파일 1개를 찾아옴
    // 왜 필요하냐면? files/complete 처리, 썸네일 생성 후 attachment 찾기, 특정 파일 상태 확인
    Optional<NoteAttachment> findByS3Key(String s3Key);

    // 특정 쪽지에 속한 첨부파일 개수를 셈
    //  왜 필요하냐면? 첨부 개수 제한(예: 최대 10개), 화면에서 첨부 개수 표시
    long countByNote(Note note);

    // 특정 noteId 기준으로 첨부파일 개수를 셈
    // Note 객체 없이도 바로 개수를 확인할 수 있게 준비한 메서드
    long countByNote_NoteId(Long noteId);
}