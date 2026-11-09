package shop.esjh.memoryjar.security;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;
/** 처리 슬롯 초과와 예외 후 반환·중복 반환을 검증한다. */
class BoundedWorkGateTest {
 @Test void limitAndReleaseAreExact() {
  var gate=new BoundedWorkGate(2);var first=gate.acquire();var second=gate.acquire();
  assertThatThrownBy(gate::acquire).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(429));
  first.close();first.close();var third=gate.acquire();
  assertThatThrownBy(gate::acquire).isInstanceOf(ResponseStatusException.class);
  second.close();third.close();try(var next=gate.acquire()) { assertThat(next).isNotNull(); }
 }
 @Test void exceptionReturnsPermit() {
  var gate=new BoundedWorkGate(1);
  assertThatThrownBy(()->{try(var permit=gate.acquire()){throw new IllegalStateException("fixture");}}).isInstanceOf(IllegalStateException.class);
  try(var again=gate.acquire()){assertThat(again).isNotNull();}
 }
}
