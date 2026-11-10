package shop.esjh.memoryjar.isolated;

import com.fasterxml.jackson.databind.*;
import jakarta.persistence.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import shop.esjh.memoryjar.MemoryJarApplication;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.monitoring.ResourceUsageEndpoint;
import shop.esjh.memoryjar.service.ai.*;
import shop.esjh.memoryjar.service.jar.JarOpenScheduler;
import shop.esjh.memoryjar.service.support.SupportCleanupScheduler;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;

/** 내부 Docker 네트워크의 임시 DB에 300명을 만들고 실제 인증/CSRF/API를 동시에 통과시킨다. 운영 부하는 아니다. */
@EnabledIfEnvironmentVariable(named="ISOLATED_SUPPORT300",matches="1")
@SpringBootTest(classes=MemoryJarApplication.class,webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,
        properties={"server.port=8080","server.address=0.0.0.0","spring.docker.compose.enabled=false",
                "management.server.port=9091","management.server.address=127.0.0.1",
                "app.cookie.secure=false","app.cookie.domain=","app.cookie.same-site=Lax",
                "app.support.mfa.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "app.support.mfa.bootstrap-secret=isolated-test-only-operator-bootstrap-secret"})
class IsolatedSupport300Test {
    @PersistenceContext EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired DataSource source;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired JwtTokenProvider jwt;
    @Autowired SupportProperties operators;
    @Autowired shop.esjh.memoryjar.repository.RefreshTokenRepository refreshTokens;
    @Autowired ResourceUsageEndpoint resources;
    @MockitoBean S3Client s3;
    @MockitoBean S3Presigner presigner;
    @MockitoBean RekognitionClient rekognition;
    @MockitoBean SesV2Client ses;
    @MockitoBean CloudflareWorkersAiClient cloudflare;
    @MockitoBean JarOpenScheduler jarScheduler;
    @MockitoBean AiDraftCleanupScheduler aiScheduler;
    @MockitoBean SupportCleanupScheduler supportScheduler;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).version(HttpClient.Version.HTTP_1_1).build();
    private final List<Sample> samples=new CopyOnWriteArrayList<>();
    private final AtomicInteger active=new AtomicInteger(),peakActive=new AtomicInteger();
    private final List<Object> resourceSamples=new CopyOnWriteArrayList<>();
    private Actor operatorActor;
    private static final String BASE="http://127.0.0.1:8080";
    private record Actor(String cookie,String csrf,long inquiryId) { }
    private record Sample(String operation,int status,double ms) { }

    /** 300개의 독립 계정에서 접수·중복 재전송·목록·대화·해결·재개를 같은 장벽에서 시작한다. */
    @Test void threeHundredAccountsCompleteSupportLifecycle() throws Exception {
        try(var connection=source.getConnection()) {
            URI target=URI.create(connection.getMetaData().getURL().substring(5).split("\\?",2)[0]);
            assertThat(target.getHost()).isEqualTo("db");assertThat(target.getPath()).isEqualTo("/isolated_e2e");
        }
        guestSecurityBoundary();
        var actors=new TransactionTemplate(transactions).execute(tx->{
            var op=User.builder().email("support-operator@example.invalid").name("시험 운영자").build();em.persist(op);operators.setOperatorUserIds(Set.of(op.getId()));
            // 운영자 추가 인증은 실제 기기 로그인을 요구한다. 일반 사용자의 기존 부하 입력과는 분리한다.
            String sessionId=UUID.randomUUID().toString();
            refreshTokens.save(shop.esjh.memoryjar.entity.RefreshToken.builder().user(op).sessionId(sessionId)
                    .tokenHash(UUID.randomUUID().toString().replace("-","").repeat(2))
                    .expiresAt(LocalDateTime.now(ZoneId.of("Asia/Seoul")).plusDays(1)).build());
            operatorActor=new Actor("accessToken="+jwt.createAccessToken(op.getId().toString(),Map.of("sessionVersion",0,"loginSessionId",sessionId)),null,0);
            List<Actor> result=new ArrayList<>();
            for(int n=0;n<300;n++) {
                var user=User.builder().email("support-"+n+"@example.invalid").name("가상 이용자 "+n).build();em.persist(user);
                // 로그인 처리 부하와 구분한다. 실제 서명/세션 버전 검사를 통과하는 테스트 전용 토큰만 메모리에서 사용한다.
                result.add(new Actor("accessToken="+jwt.createAccessToken(user.getId().toString(),Map.of("sessionVersion",0)),null,0));
            }
            em.flush();return result;
        });
        var sampler=Executors.newSingleThreadScheduledExecutor();sampler.scheduleAtFixedRate(()->resourceSamples.add(resources.read()),0,200,TimeUnit.MILLISECONDS);
        long started=System.nanoTime();
        try {
            var operatorCsrf=round(List.of(operatorActor),"operator-csrf","GET","/api/v1/csrf",a->null).get(0);
            String operatorCookie=operatorCsrf.headers().allValues("set-cookie").stream().filter(s->s.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow().split(";",2)[0];
            operatorActor=new Actor(operatorActor.cookie()+"; "+operatorCookie,data(operatorCsrf).path("token").asText(),0);
            var enrollment=round(List.of(operatorActor),"operator-mfa-enrollment","POST","/api/v1/admin/support/mfa/enrollment",
                    a->"{\"bootstrapCode\":\"isolated-test-only-operator-bootstrap-secret\"}").get(0);
            String setupKey=data(enrollment).path("secret").asText();assertThat(setupKey).matches("[A-Z2-7]{32}");
            round(List.of(operatorActor),"operator-mfa-confirmation","POST","/api/v1/admin/support/mfa/confirmation",
                    a->"{\"code\":\""+shop.esjh.memoryjar.security.OperatorMfaTestCodes.current(setupKey)+"\"}");
            var csrf=round(actors,"csrf","GET","/api/v1/csrf",a->null);
            List<Actor> prepared=new ArrayList<>();
            for(int n=0;n<300;n++) {
                var response=csrf.get(n);String cookie=response.headers().allValues("set-cookie").stream().filter(s->s.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow().split(";",2)[0];
                prepared.add(new Actor(actors.get(n).cookie()+"; "+cookie,data(response).path("token").asText(),0));
            }
            actors=prepared;
            var requests=new IdentityHashMap<Actor,String>();
            for(var a:actors)requests.put(a,json.writeValueAsString(Map.of("category","THREE_D","title","300명 동시 문의 시험","description","실제 개인정보 없는 시험 본문","requestId",UUID.randomUUID().toString())));
            var created=round(actors,"create","POST","/api/v1/support/inquiries/general",requests::get);
            var duplicate=round(actors,"create-retry","POST","/api/v1/support/inquiries/general",requests::get);
            prepared=new ArrayList<>();
            for(int n=0;n<300;n++) {
                long id=data(created.get(n)).path("inquiryId").asLong();assertThat(id).isPositive();assertThat(data(duplicate.get(n)).path("inquiryId").asLong()).isEqualTo(id);
                prepared.add(new Actor(actors.get(n).cookie(),actors.get(n).csrf(),id));
            }
            actors=prepared;
            round(actors,"list","GET","/api/v1/support/inquiries",a->null);
            round(actors,"view","GET","/api/v1/support/inquiries/{id}/view",a->null);
            requests.clear();for(var a:actors)requests.put(a,json.writeValueAsString(Map.of("content","확인할 내용을 추가합니다.","requestId",UUID.randomUUID().toString(),"waitingForUser",false)));
            var sent=round(actors,"message","POST","/api/v1/support/inquiries/{id}/messages",requests::get);
            var resent=round(actors,"message-retry","POST","/api/v1/support/inquiries/{id}/messages",requests::get);
            for(int n=0;n<300;n++)assertThat(data(sent.get(n)).path("messageId").asLong()).isEqualTo(data(resent.get(n)).path("messageId").asLong());
            var operator=operatorActor;
            var answerTargets=actors.stream().map(a->new Actor(operator.cookie(),operator.csrf(),a.inquiryId())).toList();
            round(answerTargets,"operator-reply","POST","/api/v1/admin/support/inquiries/{id}/messages",
                    a->{try{return json.writeValueAsString(Map.of("content","운영자 안내입니다.","requestId",UUID.randomUUID().toString(),"waitingForUser",false));}catch(Exception e){throw new IllegalStateException(e);}});
            round(actors,"resolve","POST","/api/v1/support/inquiries/{id}/resolve",a->null);
            round(actors,"reopen","POST","/api/v1/support/inquiries/{id}/reopen",a->null);
            var finalViews=round(actors,"final-view","GET","/api/v1/support/inquiries/{id}/view",a->null);
            for(var response:finalViews) {
                assertThat(data(response).path("messages").path("items").size()).isEqualTo(2);
                assertThat(data(response).path("inquiry").path("status").asText()).isEqualTo("IN_PROGRESS");
            }
            assertThat(jdbc.queryForObject("select count(*) from support_inquiries where owner_id is not null",Long.class)).isEqualTo(300);
            assertThat(jdbc.queryForObject("select count(*) from support_messages where author_role='USER'",Long.class)).isEqualTo(300);
            assertThat(jdbc.queryForObject("select count(*) from support_messages where author_role='OPERATOR'",Long.class)).isEqualTo(300);
            assertThat(jdbc.queryForObject("select count(*) from notifications where type='SUPPORT_INQUIRY_RECEIVED'",Long.class)).isEqualTo(300);
            assertThat(jdbc.queryForObject("select count(*) from notifications where type='SUPPORT_REPLIED'",Long.class)).isEqualTo(300);
        } finally {
            sampler.shutdownNow();
            Map<String,Object> report=new LinkedHashMap<>();report.put("scope","LOCAL_INTERNAL_NETWORK_ONLY");report.put("accounts",300);report.put("peakOutstanding",peakActive.get());
            report.put("elapsedSeconds",(System.nanoTime()-started)/1e9);report.put("requests",samples.size());report.put("statusCounts",samples.stream().collect(java.util.stream.Collectors.groupingBy(Sample::status,java.util.stream.Collectors.counting())));
            Map<String,Object> timings=new TreeMap<>();for(String operation:samples.stream().map(Sample::operation).distinct().toList())timings.put(operation,distribution(samples.stream().filter(s->s.operation().equals(operation)).mapToDouble(Sample::ms).sorted().toArray()));
            report.put("timingsMs",timings);report.put("resourceSamples",resourceSamples);report.put("note","HTTP generator and application share one 2 CPU/1536MB container; not a login, image upload, WebGL or production capacity benchmark.");
            Files.writeString(Path.of("/results/support-300.json"),json.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
        verifyNoInteractions(s3,presigner,rekognition,ses,cloudflare);
    }
    private Map<String,Double> distribution(double[] values) {
        return Map.of("p50",values[(int)Math.ceil(values.length*.50)-1],"p95",values[(int)Math.ceil(values.length*.95)-1],"p99",values[(int)Math.ceil(values.length*.99)-1],"max",values[values.length-1]);
    }
    private List<HttpResponse<String>> round(List<Actor> actors,String operation,String method,String path,java.util.function.Function<Actor,String> body) throws Exception {
        List<CompletableFuture<HttpResponse<String>>> futures=new ArrayList<>();
        for(var a:actors)futures.add(send(a,operation,method,path.replace("{id}",Long.toString(a.inquiryId())),body.apply(a)));
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).get(120,TimeUnit.SECONDS);
        List<HttpResponse<String>> results=futures.stream().map(CompletableFuture::join).toList();
        assertThat(results.stream().map(HttpResponse::statusCode).toList()).allMatch(s->s==200,operation+" HTTP 상태");return results;
    }
    private CompletableFuture<HttpResponse<String>> send(Actor actor,String operation,String method,String path,String body) {
        var request=HttpRequest.newBuilder(URI.create(BASE+path)).timeout(Duration.ofSeconds(45)).header("Cookie",actor.cookie()).header("Content-Type","application/json");
        if(actor.csrf()!=null)request.header("X-XSRF-TOKEN",actor.csrf());
        request.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        long start=System.nanoTime();peakActive.accumulateAndGet(active.incrementAndGet(),Math::max);
        return http.sendAsync(request.build(),HttpResponse.BodyHandlers.ofString()).whenComplete((response,error)->{
            samples.add(new Sample(operation,error==null?response.statusCode():0,(System.nanoTime()-start)/1e6));active.decrementAndGet();
        });
    }
    private JsonNode data(HttpResponse<String> response) throws Exception {return json.readTree(response.body()).path("data");}
    /** 공개 FAQ만 무인증이고 개인 조회/변경은 쿠키와 CSRF를 요구하는지 실제 필터로 검사한다. */
    private void guestSecurityBoundary() throws Exception {
        var client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        var request=HttpRequest.newBuilder(URI.create(BASE+"/api/v1/public/support/session"));
        var noCsrf=client.send(request.POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());assertThat(noCsrf.statusCode()).isEqualTo(403);
        var csrf=client.send(HttpRequest.newBuilder(URI.create(BASE+"/api/v1/csrf")).GET().build(),HttpResponse.BodyHandlers.ofString());
        String token=data(csrf).path("token").asText();
        var issued=client.send(request.header("X-XSRF-TOKEN",token).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());assertThat(issued.statusCode()).isEqualTo(200);
        String cookie=issued.headers().allValues("set-cookie").stream().filter(c->c.startsWith("supportGuest=")).findFirst().orElseThrow();
        assertThat(cookie).contains("HttpOnly","SameSite=Lax","Path=/api/v1/public/support").doesNotContain("Domain=");assertThat(issued.body()).doesNotContain("supportGuest","token");
        var validBody=json.writeValueAsString(Map.of("category","LOGIN_ACCOUNT","title","로그인 도움","description","가짜 시험 문의","requestId",UUID.randomUUID().toString()));
        var create=HttpRequest.newBuilder(URI.create(BASE+"/api/v1/public/support/inquiries")).header("Content-Type","application/json").header("X-XSRF-TOKEN",token);
        var invalid=client.send(create.POST(HttpRequest.BodyPublishers.ofString("{\"category\":\"LOGIN_ACCOUNT\",\"title\":\"\",\"description\":\"\",\"requestId\":\"bad\"}")).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(invalid.statusCode()).isEqualTo(400);
        var submitted=client.send(create.POST(HttpRequest.BodyPublishers.ofString(validBody)).build(),HttpResponse.BodyHandlers.ofString());assertThat(submitted.statusCode()).isEqualTo(200);
        long guestInquiry=data(submitted).path("inquiryId").asLong();assertThat(guestInquiry).isPositive();
        var guestView=client.send(HttpRequest.newBuilder(URI.create(BASE+"/api/v1/public/support/inquiries/"+guestInquiry+"/view")).GET().build(),HttpResponse.BodyHandlers.ofString());
        assertThat(guestView.statusCode()).isEqualTo(200);assertThat(data(guestView).path("inquiry").path("guest").asBoolean()).isTrue();
        var other=HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(BASE+"/api/v1/public/support/inquiries")).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(other.statusCode()).isEqualTo(401);
        var faq=client.send(HttpRequest.newBuilder(URI.create(BASE+"/api/v1/public/support/faq")).GET().build(),HttpResponse.BodyHandlers.ofString());assertThat(faq.statusCode()).isEqualTo(200);assertThat(data(faq).size()).isEqualTo(8);
    }
}
