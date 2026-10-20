package shop.esjh.memoryjar.monitoring;

import org.hibernate.BaseSessionEventListener;

/**
 * Hibernate가 원래 실행하는 DB 작업의 시작·끝만 관찰한다. 연결·SQL·결과·파라미터는 받지 않는다.
 * 연결 획득은 풀 대기와 연결 제공 처리를 포함하며, 실행 시간은 JDBC 호출의 벽시계 시간이다.
 */
public class ReadDatabaseDiagnosticsListener extends BaseSessionEventListener {
    private LoginDiagnostics.DatabaseMeasurement acquisition, preparation, execution, batch;

    @Override public void jdbcConnectionAcquisitionStart() { acquisition = LoginDiagnostics.beginDatabaseOperation(); }
    @Override public void jdbcConnectionAcquisitionEnd() {
        LoginDiagnostics.endDatabaseOperation(LoginDiagnostics.DatabaseOperation.CONNECTION_ACQUIRE, acquisition);
        acquisition = null;
    }
    @Override public void jdbcPrepareStatementStart() { preparation = LoginDiagnostics.beginDatabaseOperation(); }
    @Override public void jdbcPrepareStatementEnd() {
        LoginDiagnostics.endDatabaseOperation(LoginDiagnostics.DatabaseOperation.STATEMENT_PREPARE, preparation);
        preparation = null;
    }
    @Override public void jdbcExecuteStatementStart() { execution = LoginDiagnostics.beginDatabaseOperation(); }
    @Override public void jdbcExecuteStatementEnd() {
        LoginDiagnostics.endDatabaseOperation(LoginDiagnostics.DatabaseOperation.STATEMENT_EXECUTE, execution);
        execution = null;
    }
    @Override public void jdbcExecuteBatchStart() { batch = LoginDiagnostics.beginDatabaseOperation(); }
    @Override public void jdbcExecuteBatchEnd() {
        LoginDiagnostics.endDatabaseOperation(LoginDiagnostics.DatabaseOperation.BATCH_EXECUTE, batch);
        batch = null;
    }
}
