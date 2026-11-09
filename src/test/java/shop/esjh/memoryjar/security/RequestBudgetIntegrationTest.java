package shop.esjh.memoryjar.security;
import java.time.*;import java.util.*;import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import shop.esjh.memoryjar.service.support.SupportAccessCrypto;
import static org.assertj.core.api.Assertions.*;
/** 실제 MariaDB로 서버 공통 한도, 경쟁 요청, 롤백 뒤 횟수 보존과 키 익명화를 검사한다. */
@DataJpaTest(showSql=false,properties="app.auth.email-verification-secret=local-security-budget-test-secret-32-characters")
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({RequestBudgetService.class,SupportAccessCrypto.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class RequestBudgetIntegrationTest extends AbstractMariaDbRepositoryTest {
 @Autowired RequestBudgetService budgets;@Autowired JdbcTemplate jdbc;@Autowired PlatformTransactionManager manager;
 @org.junit.jupiter.api.BeforeEach void clearBudgets(){jdbc.update("DELETE FROM security_request_limits");}
 @Test void parallelRequestsCannotExceedSharedBudget() throws Exception {
  String key=UUID.randomUUID().toString();var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);
  try {var tasks=new ArrayList<Future<Boolean>>();for(int i=0;i<20;i++)tasks.add(pool.submit(()->{start.await();try{
   budgets.consume(new RequestBudgetService.Rule(key,3,Duration.ofHours(1)));return true;
  }catch(ResponseStatusException limit){assertThat(limit.getStatusCode().value()).isEqualTo(429);return false;}}));
  start.countDown();int success=0;for(var task:tasks)if(task.get(30,TimeUnit.SECONDS))success++;assertThat(success).isEqualTo(3);
  }finally{start.countDown();pool.shutdownNow();}
 }
 @Test void rejectionAndBusinessRollbackDoNotResetCountersAndNoIdentitiesAreStored() {
  String identity="account-"+UUID.randomUUID()+"@example.invalid";
  var rule=new RequestBudgetService.Rule(identity,1,Duration.ofHours(1));
  new TransactionTemplate(manager).executeWithoutResult(tx->{budgets.consume(rule);tx.setRollbackOnly();});
  assertThatThrownBy(()->budgets.consume(rule)).isInstanceOf(ResponseStatusException.class);
  assertThat(jdbc.queryForList("SELECT budget_key FROM security_request_limits",String.class)).allMatch(k->k.matches("[a-f0-9]{64}"));
 }
 @Test void expiryRestoresBudget() {
  var rule=new RequestBudgetService.Rule(UUID.randomUUID().toString(),1,Duration.ofMinutes(1));budgets.consume(rule);
  jdbc.update("UPDATE security_request_limits SET window_start=?",LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusHours(2));
  assertThatCode(()->budgets.consume(rule)).doesNotThrowAnyException();
 }
 void rejected(org.assertj.core.api.ThrowableAssert.ThrowingCallable call){assertThatThrownBy(call).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(429));}
 @Test void loginAccountAndIpAndGlobalBudgetsAreIndependent() {
  var account=new AuthRequestLimits(budgets,2,100,100,100,100,100,"");
  try(var a=account.beginLogin("Member","203.0.113.1")){}try(var b=account.beginLogin(" member ","203.0.113.2")){}
  rejected(()->account.beginLogin("MEMBER","203.0.113.3"));
  clearBudgets();var ip=new AuthRequestLimits(budgets,100,2,100,100,100,100,"");
  try(var a=ip.beginLogin("one","203.0.113.1")){}try(var b=ip.beginLogin("two","203.0.113.1")){}
  rejected(()->ip.beginLogin("three","203.0.113.1"));
  clearBudgets();var global=new AuthRequestLimits(budgets,100,100,2,100,100,100,"");
  try(var a=global.beginLogin("one","203.0.113.1")){}try(var b=global.beginLogin("two","203.0.113.2")){}
  rejected(()->global.beginLogin("three","203.0.113.3"));
 }
 @Test void changingEmailCannotBypassIpOrGlobalMailBudgets() {
  var address=new AuthRequestLimits(budgets,100,100,100,2,100,100,"");
  address.email("member@example.invalid","203.0.113.1");address.email("MEMBER@example.invalid","203.0.113.2");
  rejected(()->address.email("member@example.invalid","203.0.113.3"));
  clearBudgets();var ip=new AuthRequestLimits(budgets,100,100,100,100,2,100,"");
  ip.email("one@example.invalid","203.0.113.1");ip.email("two@example.invalid","203.0.113.1");
  rejected(()->ip.email("three@example.invalid","203.0.113.1"));
  clearBudgets();var global=new AuthRequestLimits(budgets,100,100,100,100,100,2,"");
  global.email("one@example.invalid","203.0.113.1");global.email("two@example.invalid","203.0.113.2");
  rejected(()->global.email("three@example.invalid","203.0.113.3"));
 }
 @Test void onlyExpiredCountersArePurgedAndWindowsCannotExceedRetentionPolicy() {
  var rule=new RequestBudgetService.Rule(UUID.randomUUID().toString(),1,Duration.ofHours(1));budgets.consume(rule);
  assertThat(budgets.cleanup()).isZero();
  jdbc.update("UPDATE security_request_limits SET updated_at=?",LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusHours(3));
  assertThat(budgets.cleanup()).isEqualTo(1);
  assertThatThrownBy(()->new RequestBudgetService.Rule("invalid-window",1,Duration.ofDays(1))).isInstanceOf(IllegalArgumentException.class);
 }
}
