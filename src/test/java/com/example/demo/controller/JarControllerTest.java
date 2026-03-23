package com.example.demo.controller;

import com.example.demo.dto.jar.request.*;
import com.example.demo.dto.jar.response.*;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.JarService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willDoNothing;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import org.springframework.security.authentication.TestingAuthenticationToken;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(JarController.class)
@AutoConfigureMockMvc(addFilters = false)
class JarControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private JarService jarService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void createJar는_201을_반환한다() throws Exception {
        // given
        JarCreateRequest request = new JarCreateRequest(
                "우리 저금통",
                "설명",
                JarTheme.BASIC,
                2,
                OffsetDateTime.of(2026, 12, 31, 0, 0, 0, 0, ZoneOffset.ofHours(9)),
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.HIDDEN
        );

        JarCreateResponse response = new JarCreateResponse(
                100L,
                "우리 저금통",
                OffsetDateTime.of(2026, 12, 31, 0, 0, 0, 0, ZoneOffset.ofHours(9)),
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.HIDDEN,
                JarRole.OWNER,
                OffsetDateTime.of(2026, 3, 23, 10, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.createJar(eq(1L), any(JarCreateRequest.class))).willReturn(response);

        // 현재 프로젝트 기준으로 principal Map 안에 userId가 들어 있음
        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars")
                        .principal(auth)
                        .with(csrf())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.jarId").value(100))
                .andExpect(jsonPath("$.data.name").value("우리 저금통"))
                .andExpect(jsonPath("$.data.myRole").value("OWNER"));
    }

    @Test
    void listMyJars는_목록을_반환한다() throws Exception {
        // given
        JarListResponse response = new JarListResponse(
                List.of(),
                0,
                20,
                0L,
                0
        );

        given(jarService.listMyJars(1L, 0, 20)).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(get("/api/v1/jars")
                        .principal(auth)
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    @Test
    void getJarDetail은_상세를_반환한다() throws Exception {
        // given
        JarDetailResponse response = new JarDetailResponse(
                10L,
                "우리 저금통",
                "설명",
                JarTheme.BASIC,
                1L,
                2,
                5,
                OffsetDateTime.of(2026, 12, 31, 0, 0, 0, 0, ZoneOffset.ofHours(9)),
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.HIDDEN,
                false,
                JarRole.OWNER,
                OffsetDateTime.of(2026, 3, 23, 10, 0, 0, 0, ZoneOffset.ofHours(9)),
                OffsetDateTime.of(2026, 3, 23, 10, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.getJarDetail(1L, 10L)).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(get("/api/v1/jars/10")
                .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.name").value("우리 저금통"))
                .andExpect(jsonPath("$.data.ownerId").value(1));
    }

    @Test
    void createInvite는_201을_반환한다() throws Exception {
        // given
        JarInviteCreateRequest request = new JarInviteCreateRequest(24, 1);

        JarInviteCreateResponse response = new JarInviteCreateResponse(
                500L,
                10L,
                "ABCD1234",
                "/invite/ABCD1234",
                OffsetDateTime.of(2026, 3, 24, 12, 0, 0, 0, ZoneOffset.ofHours(9)),
                1,
                0,
                true,
                OffsetDateTime.of(2026, 3, 23, 12, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.createInvite(1L, 10L, request)).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/invites")
                        .principal(auth)
                        .with(csrf())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.inviteId").value(500))
                .andExpect(jsonPath("$.data.code").value("ABCD1234"));
    }

    @Test
    void joinByInvite는_참여_결과를_반환한다() throws Exception {
        // given
        JarInviteJoinRequest request = new JarInviteJoinRequest("ABCD1234");

        JarInviteJoinResponse response = new JarInviteJoinResponse(
                10L,
                "우리 저금통",
                JarRole.MEMBER,
                OffsetDateTime.of(2026, 3, 23, 13, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.joinByInvite(1L, request)).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/invites/join")
                        .principal(auth)
                        .with(csrf())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.myRole").value("MEMBER"));
    }

    @Test
    void listMembers는_멤버_목록을_반환한다() throws Exception {
        // given
        JarMemberListResponse response = new JarMemberListResponse(List.of());

        given(jarService.listMembers(1L, 10L)).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/members")
                .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isArray());
    }

    @Test
    void leaveJar는_200을_반환한다() throws Exception {
        // given
        JarLeaveResponse response = new JarLeaveResponse(
                10L,
                OffsetDateTime.of(2026, 3, 23, 21, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.leaveJar(eq(1L), eq(10L))).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/leave")
                        .principal(auth)
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.leftAt").exists());
    }

    @Test
    void listInvites는_초대코드목록을_반환한다() throws Exception {
        // given
        JarInviteListResponse response = new JarInviteListResponse(
                List.of(
                        new JarInviteItem(
                                100L,
                                "ABCD1234",
                                OffsetDateTime.of(2026, 3, 24, 12, 0, 0, 0, ZoneOffset.ofHours(9)),
                                null,
                                1,
                                0,
                                true,
                                1L,
                                OffsetDateTime.of(2026, 3, 23, 12, 0, 0, 0, ZoneOffset.ofHours(9))
                        )
                )
        );

        given(jarService.listInvites(eq(1L), eq(10L))).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(get("/api/v1/jars/10/invites")
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].inviteId").value(100))
                .andExpect(jsonPath("$.data.items[0].code").value("ABCD1234"));
    }

    @Test
    void revokeInvite는_초대코드폐기결과를_반환한다() throws Exception {
        // given
        JarInviteRevokeResponse response = new JarInviteRevokeResponse(
                100L,
                OffsetDateTime.of(2026, 3, 23, 13, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.revokeInvite(eq(1L), eq(10L), eq(100L))).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/invites/100/revoke")
                        .principal(auth)
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inviteId").value(100))
                .andExpect(jsonPath("$.data.revokedAt").exists());
    }

    @Test
    void updateMemberRole은_200을_반환한다() throws Exception {
        // given
        JarMemberRoleUpdateRequest request = new JarMemberRoleUpdateRequest(JarRole.ADMIN);

        JarMemberRoleUpdateResponse response = new JarMemberRoleUpdateResponse(
                10L,
                2L,
                JarRole.ADMIN,
                OffsetDateTime.of(2026, 3, 23, 21, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.updateMemberRole(eq(1L), eq(10L), eq(2L), any(JarMemberRoleUpdateRequest.class)))
                .willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(patch("/api/v1/jars/10/members/2/role")
                        .principal(auth)
                        .with(csrf())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.userId").value(2))
                .andExpect(jsonPath("$.data.role").value("ADMIN"));
    }

    @Test
    void kickMember는_200을_반환한다() throws Exception {
        // given
        JarKickResponse response = new JarKickResponse(
                10L,
                2L,
                OffsetDateTime.of(2026, 3, 23, 21, 10, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.kickMember(eq(1L), eq(10L), eq(2L))).willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(post("/api/v1/jars/10/members/2/kick")
                        .principal(auth)
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.kickedUserId").value(2))
                .andExpect(jsonPath("$.data.kickedAt").exists());
    }

    @Test
    void updateJar는_200을_반환한다() throws Exception {
        // given
        JarUpdateRequest request = new JarUpdateRequest(
                "우리 저금통(수정)",
                "설명 바꿈",
                JarTheme.SPRING,
                5
        );

        JarUpdateResponse response = new JarUpdateResponse(
                10L,
                OffsetDateTime.of(2026, 3, 23, 22, 0, 0, 0, ZoneOffset.ofHours(9))
        );

        given(jarService.updateJar(eq(1L), eq(10L), any(JarUpdateRequest.class)))
                .willReturn(response);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(patch("/api/v1/jars/10")
                        .principal(auth)
                        .with(csrf())
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.jarId").value(10))
                .andExpect(jsonPath("$.data.updatedAt").exists());
    }

    @Test
    void deleteJar는_204를_반환한다() throws Exception {
        // given
        willDoNothing().given(jarService).deleteJar(1L, 10L);

        TestingAuthenticationToken auth = new TestingAuthenticationToken(
                Map.of("userId", 1L, "email", "user@test.com", "name", "은서"),
                null,
                "ROLE_USER"
        );

        // when & then
        mockMvc.perform(delete("/api/v1/jars/10")
                        .principal(auth)
                        .with(csrf()))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
    }
}