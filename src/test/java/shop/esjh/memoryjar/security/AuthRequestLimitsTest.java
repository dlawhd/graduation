package shop.esjh.memoryjar.security;
import org.junit.jupiter.api.Test;import static org.mockito.Mockito.*;
/** 제한 기록 정리는 짧은 배치만 수행하고 한 번에 무한 반복하지 않는다. */
class AuthRequestLimitsTest {
 @Test void cleanupStopsWhenBacklogIsSmall(){var budgets=mock(RequestBudgetService.class);when(budgets.cleanup()).thenReturn(500,12);new AuthRequestLimits(budgets,10,60,300,5,30,300,"").cleanupBudgets();verify(budgets,times(2)).cleanup();}
 @Test void cleanupNeverRunsMoreThanFourBatches(){var budgets=mock(RequestBudgetService.class);when(budgets.cleanup()).thenReturn(500);new AuthRequestLimits(budgets,10,60,300,5,30,300,"").cleanupBudgets();verify(budgets,times(4)).cleanup();}
}
