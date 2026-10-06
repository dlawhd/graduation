import org.gradle.kotlin.dsl.testImplementation

plugins {
	id("java")
	id("org.springframework.boot") version "3.5.10"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"
description = "Demo project for Spring Boot"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(17)
	}
}

configurations {
	compileOnly {
		extendsFrom(configurations.annotationProcessor.get())
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-web")

	// ✅ WebSocket + STOMP 채팅을 사용하기 위한 의존성
	// - WebSocket: 브라우저와 서버가 계속 연결된 상태로 메시지를 주고받게 해줌
	// - STOMP: WebSocket 위에서 "/topic", "/app" 같은 주소 규칙을 쉽게 쓰게 해줌
	implementation("org.springframework.boot:spring-boot-starter-websocket")
	implementation("org.mariadb.jdbc:mariadb-java-client")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.flywaydb:flyway-core")
	runtimeOnly("org.flywaydb:flyway-mysql")

	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-oauth2-client")

	// ✅ Memory Jar 자체 로그인 비밀번호를 Argon2id로 안전하게 Hash하기 위해 사용
	//
	// Spring Security의 Argon2PasswordEncoder는
	// 내부적으로 Bouncy Castle 구현이 필요하다.
	//
	// 사용자가 입력한 비밀번호 원문을 DB에 저장하지 않고
	// 되돌릴 수 없는 안전한 Hash 값으로 바꾸는 데 사용한다.
	implementation("org.bouncycastle:bcprov-jdk18on:1.85.2")

	// Redis
	// implementation("org.springframework.boot:spring-boot-starter-data-redis")

	// ✅ S3 업로드용
	implementation(platform("software.amazon.awssdk:bom:2.31.67"))
	implementation("software.amazon.awssdk:s3")
	implementation("software.amazon.awssdk:sts")
	// AI Draft 원본 이미지를 동기 심사할 때 AWS Rekognition을 사용한다.
	implementation("software.amazon.awssdk:rekognition")

	// ✅ Memory Jar 회원가입 인증메일을 AWS SES로 발송하기 위한 SDK
	implementation("software.amazon.awssdk:sesv2")

	// ✅ 이미지 썸네일 생성용
	implementation("net.coobird:thumbnailator:0.4.20")
	// 외부에서 업로드한 WebP 이미지를 서버에서 실제 바이트 기준으로 읽기 위한 ImageIO 플러그인
	implementation("com.twelvemonkeys.imageio:imageio-webp:3.13.1")

	implementation("io.jsonwebtoken:jjwt-api:0.12.5")
	runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.5")
	runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.5")

	compileOnly("org.projectlombok:lombok")
	annotationProcessor("org.projectlombok:lombok")
	developmentOnly("org.springframework.boot:spring-boot-docker-compose")


	testImplementation("org.springframework.boot:spring-boot-starter-test")
	testImplementation("org.springframework.security:spring-security-test")

	// 통합테스트용
	testImplementation("org.testcontainers:junit-jupiter")
	testImplementation("org.testcontainers:mariadb")
	testImplementation ("com.h2database:h2")
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
	useJUnitPlatform()

	// 테스트 실행 시 application-test.yml을 기본으로 읽게 한다.
	// GitHub Actions, 로컬 Gradle 테스트에서 OAuth2/JWT 테스트용 설정이 빠지지 않도록 한다.
	systemProperty("spring.profiles.active", "test")
}

// 운영 프롬프트를 바꾸지 않고 서버에서만 수동 비교할 작은 도구다.
// Spring을 시작하지 않으며, API Token이나 실제 사진은 이 산출물에 포함하지 않는다.
val aiPromptComparisonJar by tasks.registering(Jar::class) {
	dependsOn(tasks.testClasses)
	archiveFileName.set("memoryjar-ai-prompt-compare.jar")
	from(sourceSets.test.get().output.classesDirs) {
		include("shop/esjh/memoryjar/service/ai/AiPromptComparisonTool.class",
			"shop/esjh/memoryjar/service/ai/AiPromptComparisonTool\$*.class")
	}
	from("src/test/resources") { include("ai/prompt-candidates/*.txt") }
	// 배포된 기존 Catalog와 비교 기준이 다르면 외부 호출 전에 멈춘다.
	from("src/main/resources/ai/prompts") {
		include("base-v2.txt", "cute-2d-v2.txt", "hand-drawn-v1.txt")
		into("ai/comparison-baseline")
	}
}

tasks.processTestResources {
	from("src/main/resources/ai/prompts") {
		include("base-v2.txt", "cute-2d-v2.txt", "hand-drawn-v1.txt")
		into("ai/comparison-baseline")
	}
}

tasks.register<Zip>("aiPromptComparisonBundle") {
	dependsOn(aiPromptComparisonJar)
	archiveFileName.set("memoryjar-ai-prompt-compare.zip")
	destinationDirectory.set(layout.buildDirectory.dir("distributions"))
	from(aiPromptComparisonJar.flatMap { it.archiveFile })
	from("tools/ai-prompt-compare") { include("run.sh", "README.md") }
}
