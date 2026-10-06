package shop.esjh.memoryjar.service.ai;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.LoggerFactory;
import shop.esjh.memoryjar.config.properties.AiGenerationImageProperties;
import shop.esjh.memoryjar.config.properties.CloudflareAiProperties;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.enums.ai.JarPhotoFit;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Authenticator;
import java.net.CookieHandler;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/**
 * Draft #44의 귀여운 2D/손그림만 기존/후보 각 1회씩 수동 비교하는 서버 전용 도구다.
 * 테스트 소스에만 있으므로 일반 서버 빌드/테스트로 AI를 호출하지 않는다.
 * Spring, Flyway, 스케줄러는 시작하지 않고 DB SELECT와 S3 GET만 사용한다.
 * 오류 원문은 관리자만 읽는 별도 파일에 보관하고 공유할 요약에는 절대 넣지 않는다.
 */
public final class AiPromptComparisonTool {
    static final long DRAFT_ID = 44L;
    static final long SEED = 20261006L;
    static final String MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
    static final int MAX_ERROR_BYTES = 64 * 1024;
    static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    static final ObjectMapper JSON = new ObjectMapper();
    private static String phase = "ARGUMENTS";

    private AiPromptComparisonTool() { }

    /** prepare는 외부 생성 0회, run은 잠금 파일을 먼저 만든 뒤 최대 4회만 호출한다. */
    public static void main(String[] args) {
        // SDK/드라이버 예외가 URL이나 사용자 입력을 기본 로거에 출력하지 않게 한다.
        if (LoggerFactory.getILoggerFactory() instanceof LoggerContext logging) {
            logging.getLoggerList().forEach(logger -> logger.setLevel(Level.OFF));
            logging.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).setLevel(Level.OFF);
        }
        try {
            if (args.length != 2 || !(args[0].equals("prepare") || args[0].equals("run") || args[0].equals("self-check"))) {
                System.out.println("사용법: prepare|run /tmp/.../results (Draft 44 전용)");
                return;
            }
            Path output = Path.of(args[1]).toAbsolutePath().normalize();
            phase = "PRIVATE_DIRECTORY";
            if (!args[0].equals("run")) {
                Files.createDirectory(output, PosixFilePermissions.asFileAttribute(
                        PosixFilePermissions.fromString("rwx------")));
            }
            requirePrivateDirectory(output);
            if (args[0].equals("self-check")) {
                verifyPrivateStorage(output);
                System.out.println("PRIVATE_STORAGE_OK mode=0600 replay=BLOCKED symlink=BLOCKED aiCalls=0");
                return;
            }
            phase = "CONFIGURATION";
            CloudflareAiProperties provider = providerConfiguration(System.getenv());
            AiPromptCatalog catalog = new AiPromptCatalog();
            List<Trial> trials = trials(catalog);
            // JDBC 비밀값도 외부 생성 전에 존재 여부만 확인하며 출력하지 않는다.
            require(System.getenv(), "SPRING_DATASOURCE_USERNAME");
            require(System.getenv(), "SPRING_DATASOURCE_PASSWORD");
            phase = "DRAFT_READ";
            Snapshot snapshot = readDraft();
            if (args[0].equals("prepare")) prepare(output, snapshot, provider, trials);
            else run(output, snapshot, provider, trials);
        } catch (Exception | LinkageError failure) {
            // 드라이버/SDK/JSON 예외의 메시지, cause, stack trace는 출력하지 않는다.
            System.out.println("COMPARE_ABORTED phase=" + phase
                    + (failure instanceof PreflightFailure known ? " reason=" + known.reason : "")
                    + " (원문/인증정보 비출력)");
            System.exit(2);
        }
    }

    /** 명시된 한 모델, 정사각 출력, 두 스타일만 허용하고 기존/후보 조합을 고정한다. */
    static List<Trial> trials(AiPromptCatalog catalog) throws IOException {
        String base = resource("ai/comparison-baseline/base-v2.txt");
        String cute = base + System.lineSeparator() + System.lineSeparator()
                + resource("ai/comparison-baseline/cute-2d-v2.txt");
        String hand = base + System.lineSeparator() + System.lineSeparator()
                + resource("ai/comparison-baseline/hand-drawn-v1.txt");
        if (!catalog.resolve(JarAiStyle.CUTE_2D).promptVersion().equals("BASE_V2+CUTE_2D_V2")
                || !catalog.resolve(JarAiStyle.HAND_DRAWN).promptVersion().equals("BASE_V2+HAND_DRAWN_V1")
                || !cute.equals(catalog.resolve(JarAiStyle.CUTE_2D).prompt())
                || !hand.equals(catalog.resolve(JarAiStyle.HAND_DRAWN).prompt())) {
            throw new IllegalStateException();
        }
        return List.of(new Trial("CUTE_2D_OLD", cute),
                new Trial("CUTE_2D_NEW", resource("ai/prompt-candidates/cute-2d-v3.txt")),
                new Trial("HAND_DRAWN_OLD", hand),
                new Trial("HAND_DRAWN_NEW", resource("ai/prompt-candidates/hand-drawn-v2.txt")));
    }

    static CloudflareAiProperties providerConfiguration(Map<String, String> env) {
        CloudflareAiProperties properties = new CloudflareAiProperties();
        String account = require(env, "APP_AI_CLOUDFLARE_ACCOUNT_ID");
        if (!account.matches("[A-Za-z0-9_-]+")) throw new IllegalArgumentException();
        properties.setAccountId(account);
        properties.setApiToken(require(env, "APP_AI_CLOUDFLARE_API_TOKEN"));
        if (!MODEL.equals(env.getOrDefault("APP_AI_CLOUDFLARE_MODEL", MODEL))) throw new IllegalArgumentException();
        properties.setModel(MODEL);
        long timeout = Long.parseLong(env.getOrDefault("APP_AI_CLOUDFLARE_TIMEOUT_SECONDS", "60"));
        if (timeout < 1 || timeout > 120) throw new IllegalArgumentException();
        properties.setTimeoutSeconds(timeout);
        for (String key : List.of("APP_AI_GENERATION_REQUIRED_IMAGE_WIDTH", "APP_AI_GENERATION_REQUIRED_IMAGE_HEIGHT")) {
            if (!env.getOrDefault(key, "1024").equals("1024")) throw new IllegalArgumentException();
        }
        return properties;
    }

    /** 조회가 끝나면 DB 연결부터 닫는다. S3/AI 대기 동안 트랜잭션을 유지하지 않는다. */
    static Snapshot readDraft() throws Exception {
        return readDraft(System.getenv());
    }

    /** 환경을 인자로 분리해 실제 MariaDB 조회도 운영 인증 없이 테스트할 수 있게 한다. */
    static Snapshot readDraft(Map<String, String> env) throws Exception {
        String url = env.getOrDefault("SPRING_DATASOURCE_URL",
                "jdbc:mariadb://db:3306/appdb?useUnicode=true&characterEncoding=utf8");
        if (!url.startsWith("jdbc:mariadb://")) throw new IllegalArgumentException();
        String sql = """
                SELECT d.owner_id,d.original_s3_key,d.body_style,d.selected_design_type,d.status,
                d.original_s3_deleted_at,d.expires_at,d.updated_at,
                d.ai_input_x,d.ai_input_y,d.ai_input_width,d.ai_input_height,d.ai_input_fit,
                d.photo_x,d.photo_y,d.photo_width,d.photo_height,d.photo_fit,
                (SELECT COUNT(*) FROM jar_ai_generations g
                WHERE g.draft_id=d.draft_id AND g.status='PROCESSING') AS processing_count,
                (SELECT COUNT(*) FROM jar_ai_generations g WHERE g.draft_id=d.draft_id AND
                ((g.generation_id=131 AND g.ai_style='CUTE_2D') OR
                 (g.generation_id=134 AND g.ai_style='HAND_DRAWN'))) AS known_count
                FROM jar_design_drafts d WHERE d.draft_id=44
                """;
        var jdbc = new java.util.Properties();
        jdbc.setProperty("user", require(env, "SPRING_DATASOURCE_USERNAME"));
        jdbc.setProperty("password", require(env, "SPRING_DATASOURCE_PASSWORD"));
        jdbc.setProperty("connectTimeout", "5000");
        jdbc.setProperty("socketTimeout", "15000");
        try (var connection = DriverManager.getConnection(url, jdbc)) {
            connection.setReadOnly(true);
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) { statement.execute("SET TRANSACTION READ ONLY"); }
            try (var statement = connection.prepareStatement(sql)) {
                statement.setQueryTimeout(15);
                try (var row = statement.executeQuery()) {
                    if (!row.next()) throw new PreflightFailure(PreflightReason.DRAFT_NOT_FOUND);
                    if (!"ACTIVE".equals(row.getString("status"))) throw new PreflightFailure(PreflightReason.DRAFT_NOT_ACTIVE);
                    if (row.getTimestamp("original_s3_deleted_at") != null) throw new PreflightFailure(PreflightReason.ORIGINAL_ALREADY_CLEANED);
                    if (row.getInt("processing_count") != 0) throw new PreflightFailure(PreflightReason.GENERATION_ALREADY_PROCESSING);
                    if (row.getInt("known_count") != 2) throw new PreflightFailure(PreflightReason.HISTORICAL_GENERATION_MISMATCH);
                    if (!row.getTimestamp("expires_at").toLocalDateTime()
                            .isAfter(LocalDateTime.now(ZoneId.of("Asia/Seoul")))) throw new PreflightFailure(PreflightReason.DRAFT_EXPIRED);
                    JarPhotoFrameValue frame = null;
                    if (row.getString("body_style") != null) {
                        // 실제 생성 서비스의 저장 배치 우선/구 ORIGINAL 배치 fallback과 같다.
                        String prefix = row.getBigDecimal("ai_input_x") != null ? "ai_input_"
                                : "ORIGINAL".equals(row.getString("selected_design_type")) ? "photo_" : null;
                        if (prefix != null && row.getBigDecimal(prefix + "x") != null) {
                            frame = new JarPhotoFrameValue(row.getBigDecimal(prefix + "x"), row.getBigDecimal(prefix + "y"),
                                    row.getBigDecimal(prefix + "width"), row.getBigDecimal(prefix + "height"),
                                    row.getString(prefix + "fit") == null ? JarPhotoFit.COVER
                                            : JarPhotoFit.valueOf(row.getString(prefix + "fit")));
                            frame.validate();
                        }
                    }
                    String key = row.getString("original_s3_key");
                    long owner = row.getLong("owner_id");
                    // 키와 사용자 번호는 stdout에 내보내지 않고 변경 감지 해시에만 사용한다.
                    String fingerprint = sha((owner + "|" + key + "|" + frame + "|" + row.getString("body_style")
                            + "|" + row.getTimestamp("updated_at")).getBytes(StandardCharsets.UTF_8));
                    return new Snapshot(key, frame, fingerprint);
                }
            } finally { connection.rollback(); }
        }
    }

    /** 원본을 읽어 저장 장면 PNG를 한 번만 만든다. 원본 S3와 DB는 변경하지 않는다. */
    private static void prepare(Path output, Snapshot snapshot, CloudflareAiProperties provider,
                                List<Trial> trials) throws Exception {
        phase = "S3_READ";
        byte[] original;
        try (var credentials = DefaultCredentialsProvider.builder().build();
             var s3 = S3Client.builder().region(Region.of(require(System.getenv(), "APP_S3_REGION")))
                     .credentialsProvider(credentials)
                     .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(60))
                             .apiCallAttemptTimeout(Duration.ofSeconds(20))).build();
             var stream = s3.getObject(GetObjectRequest.builder().bucket(require(System.getenv(), "APP_S3_BUCKET"))
                     .key(snapshot.key()).build())) {
            original = stream.readNBytes(MAX_IMAGE_BYTES + 1);
        }
        if (original.length < 1 || original.length > MAX_IMAGE_BYTES) throw new IllegalArgumentException();
        phase = "INPUT_PREPARATION";
        byte[] input = JarAiInputImageProcessor.prepare(original, snapshot.frame());
        try (var stream = javax.imageio.ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            var readers = javax.imageio.ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new IllegalArgumentException();
            var reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                if (!reader.getFormatName().equalsIgnoreCase("png") || reader.getWidth(0) != 480 || reader.getHeight(0) != 480)
                    throw new IllegalArgumentException();
            } finally { reader.dispose(); }
        }
        privateWrite(output.resolve("input.png"), input);
        privateWrite(output.resolve("prepared.json"), JSON.writeValueAsBytes(Map.of(
                "draftId", DRAFT_ID, "seed", SEED, "model", MODEL, "inputSha256", sha(input),
                "snapshotSha256", snapshot.fingerprint(), "timeout", provider.getTimeoutSeconds(),
                "promptHashes", trials.stream().map(trial -> sha(trial.prompt().getBytes(StandardCharsets.UTF_8))).toList())));
        System.out.println("PREFLIGHT_OK draftId=44 input=480x480 plannedCalls=4 aiCalls=0 dbWrites=0 s3Writes=0");
    }

    /** 동일 PNG/seed로 순차 4회 비교한다. 첫 실행을 파일로 고정하여 재실행/자동 재시도를 막는다. */
    private static void run(Path output, Snapshot snapshot, CloudflareAiProperties provider,
                            List<Trial> trials) throws Exception {
        phase = "PREPARED_INPUT_CHECK";
        var prepared = JSON.readTree(privateRead(output.resolve("prepared.json"), 16 * 1024));
        byte[] input = privateRead(output.resolve("input.png"), MAX_IMAGE_BYTES);
        if (prepared.path("draftId").asLong() != DRAFT_ID || prepared.path("seed").asLong() != SEED
                || !MODEL.equals(prepared.path("model").asText())
                || !snapshot.fingerprint().equals(prepared.path("snapshotSha256").asText())
                || !sha(input).equals(prepared.path("inputSha256").asText())
                || provider.getTimeoutSeconds() != prepared.path("timeout").asLong()
                || !JSON.valueToTree(trials.stream().map(t -> sha(t.prompt().getBytes(StandardCharsets.UTF_8))).toList())
                    .equals(prepared.path("promptHashes"))) throw new IllegalStateException();
        phase = "ONE_SHOT_GUARD";
        privateWrite(output.resolve("run.started"), "4 calls maximum; never remove to retry\n".getBytes(StandardCharsets.UTF_8));
        AiGenerationImageProperties imageProperties = new AiGenerationImageProperties();
        long configuredMaximum = Long.parseLong(System.getenv().getOrDefault("APP_AI_GENERATION_MAX_IMAGE_SIZE", "10485760"));
        if (configuredMaximum < 1 || configuredMaximum > MAX_IMAGE_BYTES) throw new IllegalArgumentException();
        imageProperties.setMaxGeneratedImageSize(configuredMaximum);
        var validator = new GeneratedAiImageValidator(imageProperties);
        StringBuilder summary = new StringBuilder("trial\tresult\thttpStatus\tcodes\tcfRay\tproviderMs\n");
        for (Trial trial : trials) {
            phase = trial.id();
            // 편집/최종화/동시 생성이 시작됐으면 남은 호출을 중단한다. 잠금을 유지하는 방식은 아니다.
            if (!readDraft().fingerprint().equals(snapshot.fingerprint())) throw new IllegalStateException();
            var observer = new ErrorCaptureClient(HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(provider.getTimeoutSeconds())).build(),
                    bytes -> privateWrite(output.resolve(trial.id() + ".error.private"), bytes));
            var client = new CloudflareWorkersAiClient(observer, JSON, provider, imageProperties);
            long start = System.nanoTime();
            long providerMs;
            String result;
            String codes = "none";
            try {
                byte[] generated = client.generateImage(new CloudflareWorkersAiClient.CloudflareImageGenerationRequest(
                        trial.prompt(), List.of(new CloudflareWorkersAiClient.CloudflareImageInput("draft-original.png", input)), SEED));
                providerMs = (System.nanoTime() - start) / 1_000_000;
                try {
                    byte[] png = validator.validateAndNormalize(generated);
                    privateWrite(output.resolve(trial.id() + ".png"), png);
                    result = "PROVIDER_OK_IMAGE_VALID";
                } catch (GeneratedAiImageValidator.InvalidGeneratedAiImageException invalid) { result = "IMAGE_INVALID"; }
            } catch (CloudflareWorkersAiClient.CloudflareAiClientException failure) {
                providerMs = (System.nanoTime() - start) / 1_000_000;
                result = failure.getFailureType().name();
                codes = failure.getCloudflareErrorCodes().isEmpty() ? "none" : String.join(",", failure.getCloudflareErrorCodes());
                privateWrite(output.resolve(trial.id() + ".diagnostic.safe.txt"),
                        failure.getSafeDiagnostics().getBytes(StandardCharsets.UTF_8));
            }
            String line = trial.id() + "\t" + result + "\t" + observer.status + "\t" + codes
                    + "\t" + observer.ray + "\t" + providerMs + "\n";
            summary.append(line);
            System.out.print(line); // 고정 trial ID, enum, 검증된 식별자/숫자만 공유한다.
            privateWrite(output.resolve(trial.id() + ".result.safe.txt"), line.getBytes(StandardCharsets.UTF_8));
            // 인증/한도/정책 거절이 확인되면 같은 조건의 나머지 요청은 더 보내지 않는다.
            if (mustStop(result) || observer.status == 401 || observer.status == 403) break;
        }
        privateWrite(output.resolve("summary.safe.tsv"), summary.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("COMPARE_DONE moderation=NOT_RUN dbWrites=0 s3Writes=0 productionApply=NO");
    }

    static boolean mustStop(String result) {
        return List.of("CONTENT_POLICY_REJECTED", "INPUT_INVALID", "QUOTA_EXCEEDED", "RATE_LIMITED", "CAPACITY_EXCEEDED")
                .contains(result);
    }

    static void requirePrivateDirectory(Path directory) throws IOException {
        if (!directory.toRealPath().equals(directory) || Files.isSymbolicLink(directory)
                || !Files.getPosixFilePermissions(directory).equals(PosixFilePermissions.fromString("rwx------")))
            throw new IOException();
    }

    /** 인증/네트워크 없이 Linux에서 파일 권한, 덮어쓰기 방지와 심볼릭 링크 거절만 확인한다. */
    private static void verifyPrivateStorage(Path directory) throws IOException {
        Path file = directory.resolve("self-check.bin");
        privateWrite(file, new byte[]{1, 2, 3});
        if (privateRead(file, 3).length != 3) throw new IOException();
        boolean replayBlocked = false;
        try { privateWrite(file, new byte[]{4}); }
        catch (java.nio.file.FileAlreadyExistsException expected) { replayBlocked = true; }
        if (!replayBlocked) throw new IOException();
        Path link = directory.resolve("self-check-link");
        Files.createSymbolicLink(link, file);
        boolean linkBlocked = false;
        try { privateRead(link, 3); }
        catch (IOException expected) { linkBlocked = true; }
        if (!linkBlocked) throw new IOException();
    }

    /** CREATE_NEW와 0600 권한으로 원문/이미지를 덮어쓰지 않는다. Linux 권한 제어가 없으면 중단한다. */
    static void privateWrite(Path path, byte[] bytes) throws IOException {
        Files.createFile(path, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        Files.write(path, bytes, java.nio.file.StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS);
    }

    static byte[] privateRead(Path path, int maximum) throws IOException {
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                || !Files.getPosixFilePermissions(path).equals(PosixFilePermissions.fromString("rw-------"))) throw new IOException();
        try (var stream = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            byte[] bytes = stream.readNBytes(maximum + 1);
            if (bytes.length > maximum) throw new IOException();
            return bytes;
        }
    }

    static String require(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException();
        return value;
    }

    static String resource(String name) throws IOException {
        try (InputStream stream = AiPromptComparisonTool.class.getClassLoader().getResourceAsStream(name)) {
            if (stream == null) throw new IOException();
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8).trim();
        }
    }

    static String sha(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(); }
    }

    record Trial(String id, String prompt) { }
    record Snapshot(String key, JarPhotoFrameValue frame, String fingerprint) { }
    private enum PreflightReason {
        DRAFT_NOT_FOUND, DRAFT_NOT_ACTIVE, ORIGINAL_ALREADY_CLEANED,
        GENERATION_ALREADY_PROCESSING, HISTORICAL_GENERATION_MISMATCH, DRAFT_EXPIRED
    }
    private static final class PreflightFailure extends IllegalStateException {
        private final PreflightReason reason;
        PreflightFailure(PreflightReason reason) { this.reason = reason; }
    }
    @FunctionalInterface interface PrivateSink { void save(byte[] bytes) throws IOException; }

    /** 기존 Client의 multipart/검증을 재사용하면서 HTTP 오류 본문만 비공개 파일로 복사한다. */
    static final class ErrorCaptureClient extends HttpClient {
        private final HttpClient delegate;
        private final PrivateSink sink;
        int status;
        String ray = "none";
        ErrorCaptureClient(HttpClient delegate, PrivateSink sink) { this.delegate = delegate; this.sink = sink; }

        @Override public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
                throws IOException, InterruptedException {
            HttpResponse<T> response = delegate.send(request, handler);
            status = response.statusCode();
            ray = response.headers().firstValue("cf-ray").filter(v -> v.matches("[A-Za-z0-9_-]{1,128}")).orElse("none");
            if (status >= 200 && status < 300) return response;
            if (!(response.body() instanceof InputStream stream)) throw new IOException();
            byte[] bytes;
            try (stream) { bytes = stream.readNBytes(MAX_ERROR_BYTES + 1); }
            sink.save(bytes); // JSON 파싱 실패도 원문은 private 파일에만 남으며 예외로 전달하지 않는다.
            @SuppressWarnings("unchecked") T replacement = (T) new ByteArrayInputStream(bytes);
            return new CapturedResponse<>(response, replacement);
        }
        @Override public Optional<CookieHandler> cookieHandler() { return delegate.cookieHandler(); }
        @Override public Optional<Duration> connectTimeout() { return delegate.connectTimeout(); }
        @Override public Redirect followRedirects() { return delegate.followRedirects(); }
        @Override public Optional<ProxySelector> proxy() { return delegate.proxy(); }
        @Override public SSLContext sslContext() { return delegate.sslContext(); }
        @Override public SSLParameters sslParameters() { return delegate.sslParameters(); }
        @Override public Optional<Authenticator> authenticator() { return delegate.authenticator(); }
        @Override public Version version() { return delegate.version(); }
        @Override public Optional<Executor> executor() { return delegate.executor(); }
        @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest r, HttpResponse.BodyHandler<T> h) {
            throw new UnsupportedOperationException(); // 수동 비교는 순차 동기 호출만 허용한다.
        }
        @Override public <T> CompletableFuture<HttpResponse<T>> sendAsync(HttpRequest r, HttpResponse.BodyHandler<T> h,
                HttpResponse.PushPromiseHandler<T> p) { throw new UnsupportedOperationException(); }
    }

    private record CapturedResponse<T>(HttpResponse<T> original, T body) implements HttpResponse<T> {
        @Override public int statusCode() { return original.statusCode(); }
        @Override public HttpRequest request() { return original.request(); }
        @Override public Optional<HttpResponse<T>> previousResponse() { return Optional.empty(); }
        @Override public HttpHeaders headers() { return original.headers(); }
        @Override public Optional<SSLSession> sslSession() { return original.sslSession(); }
        @Override public URI uri() { return original.uri(); }
        @Override public HttpClient.Version version() { return original.version(); }
    }
}
