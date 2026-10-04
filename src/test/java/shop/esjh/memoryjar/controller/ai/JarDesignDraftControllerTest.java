package shop.esjh.memoryjar.controller.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.config.exception.ApiException;
import shop.esjh.memoryjar.enums.ai.AiDraftErrorCode;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationPreviewResponse;
import shop.esjh.memoryjar.service.ai.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import java.math.BigDecimal;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.JarSlotStyle;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.Map;
import java.time.OffsetDateTime;

/** Draft HTTP API의 인증 principal, 입력 검증, Finalize 응답 계약을 검증한다. */
@WebMvcTest(JarDesignDraftController.class)
@AutoConfigureMockMvc(addFilters = false)
class JarDesignDraftControllerTest {
 @Autowired MockMvc mockMvc; @Autowired ObjectMapper objectMapper;
 @MockitoBean JarDesignDraftUploadService uploadService; @MockitoBean JarDesignDraftService draftService;
 @MockitoBean JarAiGenerationRequestService generationRequestService; @MockitoBean JarDesignFinalizeService finalizeService;
 @MockitoBean JarAiGenerationPreviewService generationPreviewService;
 @MockitoBean JwtAuthenticationFilter jwtAuthenticationFilter; @MockitoBean JwtTokenProvider jwtTokenProvider;
 private TestingAuthenticationToken auth(){return new TestingAuthenticationToken(Map.of("userId",1L),null,"ROLE_USER");}
 @Test void composition_acceptsBodyAndFrame() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/composition").principal(auth()).contentType("application/json").content("""
      {"bodyStyle":"CAT","photoFrame":{"x":0.1,"y":0.2,"width":0.7,"height":0.5},"expectedDesignType":"ORIGINAL","expectedBodyStyle":"CAT"}
      """)).andExpect(status().isNoContent());
  verify(draftService).updateComposition(eq(1L),eq(10L),any());
 }
 @Test void composition_acceptsExplicitImageOnlyMode() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/composition").principal(auth()).contentType("application/json").content("""
      {"bodyStyle":null,"photoFrame":null,"expectedDesignType":"AI","expectedGenerationId":7,"expectedBodyStyle":"CAT"}
      """)).andExpect(status().isNoContent());
  verify(draftService).updateComposition(eq(1L),eq(10L),any());
 }
 @Test void composition_rejectsInvalidPartialUnknownAndMissingTargetBeforeService() throws Exception {
  for (String payload : new String[]{"{}", "{\"bodyStyle\":\"UNKNOWN\",\"expectedDesignType\":\"ORIGINAL\"}",
      "{\"bodyStyle\":\"CAT\",\"expectedDesignType\":\"ORIGINAL\"}",
      "{\"bodyStyle\":\"CAT\",\"photoFrame\":{\"x\":-1,\"y\":0,\"width\":1,\"height\":1},\"expectedDesignType\":\"ORIGINAL\"}"})
    mockMvc.perform(patch("/api/v1/design-drafts/10/composition").principal(auth()).contentType("application/json").content(payload)).andExpect(status().isBadRequest());
  verifyNoInteractions(draftService);
 }
 @Test void composition_requiresAuthentication() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/composition").contentType("application/json").content("{\"expectedDesignType\":\"ORIGINAL\"}"))
      .andExpect(status().isUnauthorized()); verifyNoInteractions(draftService);
 }
 @Test void upload_acceptsSelectedBody() throws Exception {
  mockMvc.perform(multipart("/api/v1/design-drafts").file("image", new byte[]{1}).param("bodyStyle", "CAT").principal(auth()))
          .andExpect(status().isCreated());
  verify(uploadService).uploadOriginalAndCreateDraft(eq(1L), any(), eq(JarBodyStyle.CAT));
 }
 @Test void upload_omittedBodyKeepsLegacyContract() throws Exception {
  mockMvc.perform(multipart("/api/v1/design-drafts").file("image", new byte[]{1}).principal(auth()))
          .andExpect(status().isCreated());
  verify(uploadService).uploadOriginalAndCreateDraft(eq(1L), any(), isNull());
 }
 @Test void upload_unknownBodyRejectedBeforeExternalCalls() throws Exception {
  mockMvc.perform(multipart("/api/v1/design-drafts").file("image", new byte[]{1}).param("bodyStyle", "UNKNOWN").principal(auth()))
          .andExpect(status().isBadRequest());
  verifyNoInteractions(uploadService);
 }
 @Test void upload_requiresAuthentication() throws Exception {
  mockMvc.perform(multipart("/api/v1/design-drafts").file("image", new byte[]{1}).param("bodyStyle", "CAT"))
          .andExpect(status().isUnauthorized());
  verifyNoInteractions(uploadService);
 }
 @Test void slot_passesAuthenticatedUserAndExpectedCandidate() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/slot").principal(auth()).contentType("application/json").content("""
          {"centerX":0.5,"centerY":0.4,"sizeRatio":0.3,"expectedDesignType":"AI","expectedGenerationId":100}
          """))
          .andExpect(status().isNoContent());
  verify(draftService).updateSlot(1L,10L,new BigDecimal("0.5"),new BigDecimal("0.4"),new BigDecimal("0.3"),JarDraftDesignType.AI,100L,null);
 }
 @Test void slot_acceptsSelectedStyle() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/slot").principal(auth()).contentType("application/json").content("""
          {"centerX":0.5,"centerY":0.4,"sizeRatio":0.3,"expectedDesignType":"ORIGINAL","slotStyle":"METAL"}
          """))
          .andExpect(status().isNoContent());
  verify(draftService).updateSlot(1L,10L,new BigDecimal("0.5"),new BigDecimal("0.4"),new BigDecimal("0.3"),JarDraftDesignType.ORIGINAL,null,JarSlotStyle.METAL);
 }
 @Test void slot_unknownStyleIsRejectedBeforeService() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/slot").principal(auth()).contentType("application/json").content("""
          {"centerX":0.5,"centerY":0.4,"sizeRatio":0.3,"slotStyle":"UNKNOWN"}
          """))
          .andExpect(status().isBadRequest());
  verifyNoInteractions(draftService);
 }
 @Test void slot_missingCoordinatesAreRejectedBeforeService() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/slot").principal(auth()).contentType("application/json").content("{\"sizeRatio\":0.5}"))
          .andExpect(status().isBadRequest());
  verifyNoInteractions(draftService);
 }
 @Test void cutout_passesAuthenticatedUserAndSelectedCandidate() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/cutout").principal(auth()).contentType("application/json").content("""
          {"points":[{"x":0.1,"y":0.2},{"x":0.8,"y":0.2},{"x":0.5,"y":0.9}],"expectedDesignType":"AI","expectedGenerationId":100}
          """))
          .andExpect(status().isNoContent());
  verify(draftService).updateCutoutRegions(eq(1L), eq(10L), anyList(), eq(JarDraftDesignType.AI), eq(100L));
 }
 @Test void cutout_acceptsMultipleRegions() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/cutout").principal(auth()).contentType("application/json").content("""
          {"regions":[[{"x":0.1,"y":0.1},{"x":0.3,"y":0.1},{"x":0.2,"y":0.3}],
                      [{"x":0.7,"y":0.7},{"x":0.9,"y":0.7},{"x":0.8,"y":0.9}]],
           "expectedDesignType":"AI","expectedGenerationId":100}
          """))
          .andExpect(status().isNoContent());
  verify(draftService).updateCutoutRegions(eq(1L), eq(10L), argThat(regions -> regions.size() == 2),
          eq(JarDraftDesignType.AI), eq(100L));
 }
 @Test void cutout_withoutPointsIsRejectedBeforeService() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/cutout").principal(auth()).contentType("application/json").content("{}"))
          .andExpect(status().isBadRequest());
  verifyNoInteractions(draftService);
 }
 @Test void slot_changedCandidateReturnsConflictAndFeatureCode() throws Exception {
  doThrow(new ApiException(AiDraftErrorCode.DRAFT_SLOT_TARGET_CHANGED)).when(draftService)
          .updateSlot(eq(1L),eq(10L),any(),any(),any(),eq(JarDraftDesignType.ORIGINAL),isNull(),isNull());
  mockMvc.perform(patch("/api/v1/design-drafts/10/slot").principal(auth()).contentType("application/json").content("""
          {"centerX":0.5,"centerY":0.5,"sizeRatio":0.5,"expectedDesignType":"ORIGINAL"}
          """))
          .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("DRAFT_SLOT_TARGET_CHANGED"));
 }
 @Test void generation_requiresStyle() throws Exception { mockMvc.perform(post("/api/v1/design-drafts/10/generations").principal(auth()).contentType("application/json").content("{}")) .andExpect(status().isBadRequest()); }
 @Test void aiSelection_requiresGenerationId() throws Exception { mockMvc.perform(patch("/api/v1/design-drafts/10/selection").principal(auth()).contentType("application/json").content("{\"designType\":\"AI\"}")) .andExpect(status().isBadRequest()); }
 @Test void defaultSelection_usesAuthenticatedUser() throws Exception { mockMvc.perform(patch("/api/v1/design-drafts/10/selection").principal(auth()).contentType("application/json").content("{\"designType\":\"DEFAULT\"}")) .andExpect(status().isNoContent()); verify(draftService).selectDefault(1L,10L); }
 @Test void draftOwnerError_returnsFeatureCode() throws Exception {
  when(draftService.getDraftSummary(1L,10L)).thenThrow(new ApiException(AiDraftErrorCode.DRAFT_NOT_OWNER));
  mockMvc.perform(get("/api/v1/design-drafts/10").principal(auth()))
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.error.code").value("DRAFT_NOT_OWNER"));
 }
 @Test void duplicateGeneration_returnsFeatureCode() throws Exception {
  when(generationRequestService.request(1L,10L,shop.esjh.memoryjar.enums.ai.JarAiStyle.CUTE_2D,null))
          .thenThrow(new ApiException(AiDraftErrorCode.AI_GENERATION_ALREADY_PROCESSING));
  mockMvc.perform(post("/api/v1/design-drafts/10/generations").principal(auth()).contentType("application/json").content("{\"style\":\"CUTE_2D\"}"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.error.code").value("AI_GENERATION_ALREADY_PROCESSING"));
 }
 @Test void generation_returnsAcceptedGenerationIdWithoutWaitingForProvider() throws Exception {
  when(generationRequestService.request(1L,10L,shop.esjh.memoryjar.enums.ai.JarAiStyle.CUTE_2D,7L))
          .thenReturn(100L);
  mockMvc.perform(post("/api/v1/design-drafts/10/generations").principal(auth()).contentType("application/json")
          .content("{\"style\":\"CUTE_2D\",\"seed\":7}"))
          .andExpect(status().isAccepted())
          .andExpect(jsonPath("$.data.generationId").value(100));
  verify(generationRequestService).request(1L,10L,shop.esjh.memoryjar.enums.ai.JarAiStyle.CUTE_2D,7L);
 }
 @Test void processingFinalize_returnsFeatureCode() throws Exception {
  when(finalizeService.finalizeDraft(anyLong(),anyLong(),any())).thenThrow(new ApiException(AiDraftErrorCode.DRAFT_PROCESSING_FINALIZE_BLOCKED));
  mockMvc.perform(post("/api/v1/design-drafts/10/finalize").principal(auth()).contentType("application/json").content("""
          {"name":"디자인 Jar","theme":"SPRING","maxMembers":2,"openAt":"2026-10-01T12:00:00","openMode":"ALL_AT_ONCE","lockLevel":"HIDDEN"}
          """))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.error.code").value("DRAFT_PROCESSING_FINALIZE_BLOCKED"));
 }
 @Test void finalize_returnsCreatedJarAndSelectedDesignType() throws Exception {
  when(finalizeService.finalizeDraft(eq(1L),eq(10L),any())).thenReturn(
          new JarDesignFinalizePersistenceService.FinalizeResult(77L, JarDraftDesignType.AI));
  mockMvc.perform(post("/api/v1/design-drafts/10/finalize").principal(auth()).contentType("application/json").content("""
          {"name":"디자인 Jar","description":"최종 확인","theme":"SPRING","maxMembers":2,"openAt":"2026-10-01T12:00:00","openMode":"ALL_AT_ONCE","lockLevel":"HIDDEN"}
          """))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.data.jarId").value(77))
          .andExpect(jsonPath("$.data.designType").value("AI"));
  verify(finalizeService).finalizeDraft(eq(1L),eq(10L),any());
 }
 @Test void candidatePreview_usesAuthenticatedUserAndReturnsPresignedUrl() throws Exception {
  when(generationPreviewService.createPreviewUrl(1L,10L,100L)).thenReturn(
          new JarAiGenerationPreviewResponse("https://signed.example.test/candidate", OffsetDateTime.parse("2026-09-20T12:00:00Z")));
  mockMvc.perform(get("/api/v1/design-drafts/10/generations/100/preview").principal(auth()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.previewUrl").value("https://signed.example.test/candidate"));
  verify(generationPreviewService).createPreviewUrl(1L,10L,100L);
 }
 @Test void compositionWholeFitReachesServiceAndUnknownFitIsRejected() throws Exception {
  mockMvc.perform(patch("/api/v1/design-drafts/10/composition").principal(auth()).contentType("application/json").content("""
          {"bodyStyle":"CAT","photoFrame":{"x":0,"y":0.25,"width":1,"height":0.5,"fit":"CONTAIN"},"expectedDesignType":"ORIGINAL","expectedBodyStyle":"CAT"}
          """)) .andExpect(status().isNoContent());
  verify(draftService).updateComposition(eq(1L),eq(10L),argThat(r -> r.photoFrame().fit() == shop.esjh.memoryjar.enums.ai.JarPhotoFit.CONTAIN));
  org.mockito.Mockito.clearInvocations(draftService);
  mockMvc.perform(patch("/api/v1/design-drafts/10/composition").principal(auth()).contentType("application/json").content("""
          {"bodyStyle":"CAT","photoFrame":{"x":0,"y":0,"width":1,"height":1,"fit":"STRETCH"},"expectedDesignType":"ORIGINAL"}
          """)) .andExpect(status().isBadRequest());
  verifyNoInteractions(draftService);
 }
 @Test void originalPreview_usesAuthenticatedUserAndReturnsPresignedUrl() throws Exception {
  when(generationPreviewService.createOriginalPreviewUrl(1L,10L)).thenReturn(
          new JarAiGenerationPreviewResponse("https://signed.example.test/original", OffsetDateTime.parse("2026-09-20T12:00:00Z")));
  mockMvc.perform(get("/api/v1/design-drafts/10/original/preview").principal(auth()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.previewUrl").value("https://signed.example.test/original"));
  verify(generationPreviewService).createOriginalPreviewUrl(1L,10L);
 }
}
