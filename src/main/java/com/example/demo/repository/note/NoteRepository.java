package com.example.demo.repository.note;

import com.example.demo.entity.note.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, Long> {

    // 삭제되지 않은 쪽지 1개 찾기
    Optional<Note> findByNoteId(Long noteId);

    // 특정 저금통의 쪽지 목록 조회
    // 최신순으로 보여주려고 createdAt 내림차순 정렬
    @Query("""
            select n
            from Note n
            where n.jar.jarId = :jarId
            order by n.createdAt desc
            """)
    Page<Note> findByJarId(@Param("jarId") Long jarId, Pageable pageable);

    // 특정 저금통 안의 특정 쪽지 1개 찾기
    // 남의 저금통 쪽지를 잘못 조회하지 않게 jarId도 같이 확인
    @Query("""
            select n
            from Note n
            where n.noteId = :noteId
              and n.jar.jarId = :jarId
            """)
    Optional<Note> findByJarIdAndNoteId(
            @Param("jarId") Long jarId,
            @Param("noteId") Long noteId
    );
}