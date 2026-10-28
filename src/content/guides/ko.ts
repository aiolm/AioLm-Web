import type { GuideContent } from './types';
const content: GuideContent = {
  title: 'AioLM 사용 안내', description: '앱 설치부터 엔진 선택, 첫 로컬 모델 실행까지. 시작하는 데 필요한 내용을 짧은 단계로 정리했습니다.',
  navigation: '사용 안내', onPage: '이 페이지에서', related: '다음 안내', download: '최신 버전 다운로드',
  screenshotAlt: '공개 데모 GGUF 파일이 표시된 AioLM 모델 라이브러리',
  screenshotCaption: '이전 데스크톱 UI(v0.1.18)의 모델 라이브러리입니다. 공개 데모 파일을 사용했으며 현재 엔진 설정 화면과는 다릅니다. 이미지를 누르면 원본 크기로 볼 수 있습니다.',
  guides: {
    install: { title: '설치 가이드', description: '컴퓨터에 맞는 패키지를 고르고, 다운로드를 확인한 뒤 AioLM을 설치하세요.', sections: [
      { id: 'windows', title: 'Windows', body: ['Windows x64에서는 x64-setup.exe를 다운로드해 설치하세요. Windows Installer 배포가 필요하면 MSI를 선택합니다. 홈의 PowerShell 설치 명령도 사용할 수 있습니다.', '배포 설치 파일은 서명되지 않았습니다. 게시자 경고가 표시되면 릴리스 출처와 체크섬을 확인한 뒤 진행하세요.'] },
      { id: 'macos', title: 'macOS', body: ['macOS 13.3 이상이 필요합니다. Apple Silicon은 aarch64.dmg, Intel은 x64.dmg를 선택하세요. DMG를 열고 AioLM을 응용 프로그램 폴더로 드래그합니다.', '앱은 ad-hoc 서명되었으며 Apple 공증을 받지 않았습니다. 한 번 실행을 시도한 뒤 시스템 설정 → 개인정보 보호 및 보안 → 확인 없이 열기를 선택하세요. macOS 13–14에서는 Control-클릭 → 열기도 가능합니다.'], code: 'shasum -a 256 ./AioLM_*.dmg' },
      { id: 'linux', title: 'Linux', body: ['Ubuntu 24.04 이상, x86_64용입니다. DEB는 앱 메뉴 바로가기와 의존성을 함께 설치합니다. 작업 폴더에는 설치할 버전의 파일만 두고 체크섬을 비교한 뒤 실행하세요.'], code: 'sha256sum ./AioLM_*_amd64.deb\nsudo apt install ./AioLM_*_amd64.deb', note: 'AppImage는 libgomp1·libfuse2t64를 설치하고 chmod +x로 실행 권한을 준 뒤 실행합니다. 같은 릴리스의 register-linux-desktop.py도 체크섬을 확인하고 python3 register-linux-desktop.py --appimage <파일>로 바로가기를 등록하세요. 파일 위치를 유지하고, DEB로 바꾸기 전 --remove로 등록을 해제하세요.' },
      { id: 'verify', title: '다운로드 확인', body: ['설치 파일과 같은 릴리스의 checksums.txt를 받으세요. 정확히 같은 파일명의 SHA-256 전체 값과 비교하고, 다르면 설치를 중단합니다. Windows에서는 아래 명령에 다운로드한 파일명을 넣으세요. 체크섬은 무결성을 확인하며 게시자 서명을 대신하지 않습니다.'], code: 'Get-FileHash -Algorithm SHA256 .\\AioLM_0.3.2_x64-setup.exe' },
      { id: 'updates', title: '업데이트와 데이터', body: ['작업을 저장한 뒤 설정 → 일반 → 애플리케이션 업데이트에서 업데이트 확인 및 다운로드·설치를 선택하고 승인하세요. 시스템 설치를 마친 뒤 앱을 다시 엽니다. DMG는 기존 앱을 교체하고, AppImage·수동 설치는 릴리스 페이지를 이용합니다.', '데이터는 macOS/Linux의 ~/.aiolm, Windows의 %USERPROFILE%\\.aiolm에 저장됩니다. AIOLM_HOME을 지정했다면 해당 폴더를 사용합니다. 이 폴더와 모델을 백업하세요. 앱 교체 시 데이터는 유지되지만 Windows NSIS 제거에서 앱 데이터 삭제를 선택할 수 있습니다. MSI·DEB 제거와 Mac 앱 휴지통 이동은 데이터를 유지합니다.'], note: 'v0.3.2 패키지 검사는 통과했습니다. 실제 v0.3.1 → v0.3.2 업데이트 설치와 기기 UI 검증은 아직 완료되지 않았습니다.' },
    ] },
    compatibility: { title: '엔진·모델 호환성', description: '앱 실행 조건과 추론 엔진의 실행 조건은 다릅니다. 모델을 받기 전에 엔진·하드웨어·모델 형식을 함께 확인하세요.', sections: [
      { id: 'engines', title: '엔진별 빠른 비교', table: { headers: ['엔진', '실행 환경', '모델 파일'], rows: [
        ['llama.cpp', 'Windows / macOS / Linux와 호환 CPU·GPU 런타임', 'GGUF, 멀티모달 지원 모델은 호환 projector 필요'],
        ['vLLM', '지원되는 Linux 가속기 환경', '지원 모델의 완전한 Hugging Face safetensors 스냅샷'],
        ['vLLM · vllm-metal', 'Apple Silicon, macOS 15+, 네이티브 arm64 Python 3.12', '지원 HF/MLX 스냅샷, 제한된 일부 GGUF'],
        ['MLX · mlx-vlm', 'Apple Silicon Mac와 호환 Python 환경', '지원 모델의 완전한 MLX 또는 HF safetensors 스냅샷'],
        ['외부 어댑터', '해당 엔진의 OS·가속기·의존성 조건', '어댑터와 모델 probe로 확인한 형식'],
      ] } },
      { id: 'hardware', title: '런타임 설치 전 확인', steps: ['모델과 컨텍스트 크기에 필요한 RAM·VRAM을 확인하세요. 다운로드 성공만으로 메모리에 적재할 수 있다는 뜻은 아닙니다.', '관리형 환경을 설치하거나 호환 Python 인터프리터를 등록하세요. Linux 관리형 vLLM은 CUDA 의존성을 사용합니다. ROCm은 드라이버와 맞는 환경을 별도로 준비해 등록해야 합니다.', 'Apple Silicon에서는 vLLM을 선택하면 vllm-metal을 사용합니다. Intel Mac은 MLX·vllm-metal을 사용할 수 없습니다. 네이티브 Windows vLLM·WSL·원격 실행은 이 앱의 로컬 런타임 대상이 아닙니다.'] },
      { id: 'models', title: '모델과 기능 지원', body: ['Python 엔진은 safetensors 파일 하나가 아니라 config·tokenizer/processor·전체 가중치 조각을 포함한 스냅샷이 필요합니다. 일반 GGUF 지원이 vllm-metal의 GGUF 호환성을 뜻하지는 않습니다.', '이미지·음성·영상·도구·임베딩은 모델, 설치된 런타임, 요청 프로토콜이 모두 지원해야 합니다. 비활성 기능에는 이유가 표시됩니다. 엔진 등록만으로 벤치마크·심층 검증·포터블 번들 기능이 추가되지는 않습니다.'] },
      { id: 'limits', title: '현재 검증 범위', body: ['선택한 설치본의 준비 상태를 확인하고 실제 기기에서 모델을 실행하세요. 패키지 검사나 Windows CI 통과는 Linux vLLM·Mac 추론의 실제 동작을 보장하지 않습니다.'], note: 'SmolVLM 이미지·영상 내용 품질 실패 F09는 미해결입니다. Linux 전체 검증과 실제 업데이트 설치·UI 검증은 완료되지 않았습니다.' },
    ] },
    adapters: { title: '외부 추론 엔진 연결', description: 'Strata·TensorFold·자체 빌드를 호환 로컬 어댑터로 연결하세요. 실행 방식은 어댑터가 정의하고 작업 공간은 AioLM으로 통합합니다.', sections: [
      { id: 'prepare', title: '엔진과 어댑터 준비', body: ['먼저 컴퓨터에 맞는 엔진과 의존성을 설치하세요. 검토한 실행 파일·진입점, 모델 호환성 probe, OpenAI 호환 로컬 HTTP/SSE 서버 또는 그 규약을 구현한 bridge가 필요합니다.', '엔진 실행 파일만으로는 연결되지 않을 수 있습니다. Strata·TensorFold·개인 빌드는 해당 버전과 모델 형식에 맞는 어댑터가 필요하며, 모두 기본 설치되는 런타임은 아닙니다.'] },
      { id: 'register', title: '네 단계로 등록하기', steps: ['런타임 설정에서 실행 파일 또는 진입점 등록을 선택하세요. 실행 중인 모델·작업을 먼저 종료합니다. custom.* 엔진 ID, 런타임 ID, 실행 파일과 순서가 있는 진입점 인자를 지정합니다.', '실제로 HTTP를 제공하는 명령의 도움말을 탐색하고 옵션을 검토하세요. 제공된 어댑터 옵션 metadata도 입력할 수 있습니다. bridge를 쓴다면 전달할 옵션이 bridge 도움말에 있어야 합니다.', '모델·포트 바인딩, 직접 HTTP 또는 bridge, 호환성 probe 명령, 모델 형식과 상태 경로를 설정합니다. 인증 정보는 선언한 환경 변수 바인딩으로 전달합니다.', '내용을 검토해 등록하세요. 실행 프로필에서 해당 런타임과 모델을 선택해 호환성을 확인한 뒤 응답·취소·중지·재시작을 실제로 시험합니다.'] },
      { id: 'changes', title: '엔진이 바뀌면', body: ['실행 파일·진입점·어댑터 파일이 바뀌면 도움말 검토와 모델 probe를 다시 수행하세요. 모델·호스트·포트·인증은 앱이 관리하므로 추가 인자로 덮어쓸 수 없습니다.', '등록은 엔진 자체의 실행 조건을 없애지 않습니다. 등록을 제거해도 외부 파일은 유지됩니다. 도움말·probe도 로컬 코드를 실행하므로 신뢰할 수 있는 프로그램만 등록하세요.'], note: '현재 공개 벤치마크 공유 계약은 외부 custom.* 엔진을 받지 않습니다. 엔진 등록 지원과 벤치마크·심층 검증·포터블 런타임 지원은 별개입니다.' },
    ] },
    'getting-started': { title: '첫 모델 실행하기', description: '처음 설치한 앱에서 엔진과 모델을 함께 확인하고 로컬 대화를 시작하세요.', sections: [
      { id: 'setup', title: '1. 작업 공간 설정', body: ['시작 화면에서 언어·테마·모델 폴더를 선택한 뒤 AioLM 시작을 누르세요. 기존 모델 폴더를 지정하거나 나중에 모델을 받을 수 있습니다. 이전 설정이 있다면 시작 화면을 건너뜁니다.'] },
      { id: 'runtime', title: '2. 엔진과 모델 선택', body: ['런타임 설정에서 호환 런타임을 설치하거나 등록하세요. 모델 설정에서 엔진·설치본·프로필을 먼저 고른 뒤 해당 조합이 지원하는 모델을 선택합니다. llama.cpp는 GGUF, Python 엔진은 완전한 스냅샷을 준비하세요.'], screenshot: true },
      { id: 'chat', title: '3. 불러온 뒤 대화 시작', body: ['모델 호환성과 실행 옵션을 확인하고 모델을 불러오세요. 짧은 텍스트 질문부터 시작합니다. 이미지·음성·영상·도구는 선택한 모델·런타임이 지원할 때만 추가하세요.', '옵션은 선택한 런타임의 도움말·metadata를 따릅니다. 컨텍스트·병렬 처리·실행 인자 변경은 재시작이 필요하며 샘플링은 다음 요청부터 적용할 수 있습니다. 실행 실패 시 준비 상태 안내와 엔진 로그를 먼저 확인하세요.'] },
      { id: 'benchmarks', title: '4. 지원되는 조합에서 측정·공유', body: ['지원되는 엔진·모델로 성능 벤치마크를 실행하고, 같은 측정 방법과 워크로드끼리 비교하세요. 성능 점수는 모델 품질이나 기기 전체 검증 결과가 아닙니다.', '공유는 선택 사항이며 브라우저 확인이 필요합니다. 공개할 데이터를 먼저 검토하세요. 계정 없이 기록을 관리하려면 복구 코드·백업 파일을 비공개로 보관해야 합니다. 앱에서 관리를 열거나 이 사이트의 관리 화면에 복구 파일·코드를 입력하세요.'] },
    ] },
  },
};
export default content;
