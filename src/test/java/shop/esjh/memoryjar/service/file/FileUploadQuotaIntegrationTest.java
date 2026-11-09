package shop.esjh.memoryjar.service.file;
import java.time.*;import java.util.*;import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.*;import org.springframework.transaction.annotation.*;import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.JpaAuditConfig;import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.enums.file.*;import shop.esjh.memoryjar.dto.file.request.*;import shop.esjh.memoryjar.dto.file.response.*;
import software.amazon.awssdk.services.s3.S3Client;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
/** 같은 계정의 발급이 경쟁해도 실제 DB 잠금과 합계 검사로 계정 한도를 넘지 않는지 확인한다. */
@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class,FileService.class,FileUploadTransactionService.class,FileUploadPolicy.class,FileProperties.class,FileUploadReservationService.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class FileUploadQuotaIntegrationTest extends AbstractMariaDbRepositoryTest {
 @Autowired shop.esjh.memoryjar.repository.file.FileUploadRepository uploads;
 @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
 @Autowired FileService files;@Autowired FileProperties properties;@Autowired PlatformTransactionManager manager;
 @MockitoBean S3PresignService presigner;@MockitoBean S3Client s3;@MockitoBean S3Properties storage;@MockitoBean UploadedMediaValidator media;
 @BeforeEach void configure(){properties.setMaxUploadsPerHour(3);properties.setMaxPendingUploads(20);properties.setMaxAccountBytes(1073741824L);
  when(presigner.createPresignedUrl(any())).thenAnswer(call->{assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();return new FilePresignResponse("https://fixture.invalid/put","notes/"+UUID.randomUUID()+".png","/api/v1/files/pending",OffsetDateTime.now().plusMinutes(5));});}
 Long user(){return new TransactionTemplate(manager).execute(tx->{String id=UUID.randomUUID().toString();return saveUser(id,id+"@example.invalid","시험").getId();});}
 FilePresignRequest request(){return new FilePresignRequest(FilePurpose.NOTE,"photo.png","image/png",1024L);}
 @Test void sameAccountConcurrentPresignsHaveThreeSuccessesAndOnly429Rejections()throws Exception{
  Long user=user();var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);var results=new ArrayList<Future<Boolean>>();
  try{for(int i=0;i<12;i++)results.add(pool.submit(()->{start.await();try{files.createPresignedUrl(user,request());return true;}catch(ResponseStatusException limit){assertThat(limit.getStatusCode().value()).isEqualTo(429);return false;}}));
   start.countDown();int count=0;for(var result:results)if(result.get(30,TimeUnit.SECONDS))count++;assertThat(count).isEqualTo(3);
   assertThat(uploads.findAllByUser_IdAndStatus(user,FileUploadStatus.PRESIGNED)).hasSize(3)
     .allSatisfy(upload->assertThat(upload.getPublicUrl()).isEqualTo("/api/v1/files/uploads/"+upload.getId()+"/content"));
  }finally{start.countDown();pool.shutdownNow();}
 }
 @Test void pendingAndStoredByteLimitsAreIndependent(){Long first=user();properties.setMaxPendingUploads(1);files.createPresignedUrl(first,request());
  assertThatThrownBy(()->files.createPresignedUrl(first,request())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(429));
  Long second=user();properties.setMaxPendingUploads(20);properties.setMaxAccountBytes(1500);files.createPresignedUrl(second,request());
  assertThatThrownBy(()->files.createPresignedUrl(second,request())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
 }
 @Test void expiredButUncleanedStagingStillReservesAccountBytes() {
  Long owner=user();properties.setMaxAccountBytes(1500);
  var ticket=files.createPresignedUrl(owner,request());
  jdbc.update("UPDATE file_uploads SET status='EXPIRED',staging_cleaned_at=NULL WHERE s3_key=?",ticket.s3Key());
  assertThatThrownBy(()->files.createPresignedUrl(owner,request())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
  jdbc.update("UPDATE file_uploads SET staging_cleaned_at=? WHERE s3_key=?",LocalDateTime.now(),ticket.s3Key());
  assertThatCode(()->files.createPresignedUrl(owner,request())).doesNotThrowAnyException();
 }
}
