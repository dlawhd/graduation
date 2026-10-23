"""스왑 정책 한 값을 임시 비교하고, 통신 단절에도 서버 타이머로 원복되도록 돕는다.

영구 설정·컨테이너·Heap·DB는 수정하지 않는다. 원래 값 60과 시험 값 10만 허용한다.
이 모듈은 명시적인 제어 도구가 원격에서 호출하며, import만으로 설정을 바꾸지 않는다.
"""
import pathlib
import re
import subprocess

SWAP_PATH='/proc/sys/vm/swappiness'


def rollback_source(original=60,target=10):
    """현재 값이 우리가 쓴 시험 값일 때만 되돌려 다른 관리자의 변경을 덮어쓰지 않는다."""
    if (original,target)!=(60,10):
        raise ValueError('ONLY_60_TO_10_APPROVED')
    return "from pathlib import Path;p=Path('/proc/sys/vm/swappiness');v=int(p.read_text());p.write_text('60\\n') if v==10 else None"


class TemporarySwapPolicy:
    """자동 원복 타이머를 먼저 확인한 뒤 휘발성 설정 한 값만 바꾸는 안전 경계다."""
    def __init__(self,unit,run=None,path=None):
        if not re.fullmatch(r'memoryjar-swap-trial-[0-9]{8}-[0-9]{6}',unit or ''):
            raise ValueError('INVALID_TRIAL_UNIT')
        self.unit=unit
        self.run=run or self.command
        self.path=path or pathlib.Path(SWAP_PATH)

    @staticmethod
    def command(args):
        result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=8)
        return result.stdout.decode().strip()

    def value(self):
        return int(self.path.read_text().strip())

    def apply(self):
        """12분 자동 원복을 예약한 뒤 60→10만 적용한다. 타이머 실패 시 설정을 건드리지 않는다."""
        if self.value()!=60:
            raise ValueError('ORIGINAL_POLICY_IS_NOT_60')
        state=self.run(['systemctl','show',self.unit+'.timer','--property=LoadState','--value'])
        if state!='not-found':
            raise ValueError('TRIAL_UNIT_ALREADY_EXISTS')
        self.run(['systemd-run','--unit='+self.unit,'--on-active=12min','--timer-property=AccuracySec=1s',
            '--property=Type=oneshot','/usr/bin/python3','-c',rollback_source()])
        if self.run(['systemctl','is-active',self.unit+'.timer'])!='active':
            raise ValueError('ROLLBACK_TIMER_NOT_ACTIVE')
        # 예약과 쓰기 사이에 다른 관리자가 값을 변경한 경우도 덮어쓰지 않는다.
        if self.value()!=60:
            raise ValueError('POLICY_CHANGED_BEFORE_APPLY')
        self.path.write_text('10\n')
        if self.value()!=10:
            raise ValueError('APPLY_VERIFICATION_FAILED')
        return {'status':'APPLIED','original':60,'temporary':10,'autoRestoreSeconds':720,'unit':self.unit}

    def restore(self):
        """자신의 값 10만 60으로 돌리고 확인한 뒤 자신의 원복 타이머만 취소한다."""
        value=self.value()
        if value not in (10,60):
            raise ValueError('ANOTHER_POLICY_VALUE_DO_NOT_OVERWRITE')
        if value==10:
            self.path.write_text('60\n')
        if self.value()!=60:
            raise ValueError('RESTORE_VERIFICATION_FAILED')
        state=self.run(['systemctl','show',self.unit+'.timer','--property=LoadState','--value'])
        if state!='not-found':
            self.run(['systemctl','stop',self.unit+'.timer'])
        return {'status':'RESTORED','value':60,'unit':self.unit}
