import type { GuideContent } from './types';
import { DESKTOP_RELEASE_VERSION, SCREENSHOT_SOURCE_VERSION } from '@/lib/desktop-release';

const content: GuideContent = {
  title: 'AioLM 사용 안내',
  description: '앱 설치, 엔진 준비, 모델 다운로드부터 첫 대화까지 핵심만 빠르게 확인하세요.',
  navigation: '사용 안내',
  onPage: '이 페이지의 목차',
  related: '이어서 보기',
  download: '전체 다운로드 파일 보기',
  screenshotNotice: `설명은 v${DESKTOP_RELEASE_VERSION} 기준입니다. 화면 예시는 v${SCREENSHOT_SOURCE_VERSION} macOS 앱에서 촬영했으므로 일부 라벨·배치가 다릅니다.`,
  enlarge: '화면 크게 보기',
  close: '닫기',
  panHint: '화면을 좌우로 밀어 다른 부분도 볼 수 있습니다.',
  guides: {
    install: {
      title: '앱 설치하기',
      description: '체크섬 확인 후 Windows·Mac·Linux에 AioLM을 설치합니다.',
      sections: [
        {
          id: 'commands',
          title: '설치 흐름 한눈에 보기',
          diagram: 'install-flow',
          body: ['아래에서 내 운영체제를 골라 빠른 명령어 또는 검증된 설치 파일로 설치하세요.'],
          points: [
            'Windows·Mac 원라이너는 내려받은 설치 파일의 SHA-256을 검증하지만, 스크립트 자체는 사전 검증 없이 실행됩니다.',
            '설치 파일부터 직접 검증하려면 아래 OS별 섹션에서 설치 파일과 checksums.txt를 받아 확인하세요.',
            'Linux는 DEB 파일을 먼저 내려받은 뒤 설치 명령을 실행합니다.',
          ],
        },
        {
          id: 'windows',
          title: 'Windows에서 설치',
          downloads: 'windows',
          steps: [
            '같은 릴리스에서 x64-setup.exe(또는 MSI)와 checksums.txt를 받으세요.',
            'SHA-256 체크섬이 일치하는지 확인한 뒤 설치 파일을 실행합니다.',
            '설치가 끝나면 시작 메뉴에서 AioLM을 엽니다.',
          ],
          note: '미서명 설치 파일이므로 보안 경고가 뜰 수 있습니다. 공식 릴리스와 SHA-256을 먼저 확인하세요.',
          more: [{
            title: 'MSI 및 자동 설치 참고',
            body: ['기업 배포 도구는 Windows x64 MSI, 개인 PC는 EXE를 권장합니다. install.ps1에서는 MSI 종료 코드 3010(재부팅 필요)과 1641(재부팅 시작)도 성공으로 처리합니다.'],
          }],
        },
        {
          id: 'macos',
          title: 'Mac에서 설치',
          downloads: 'macos',
          steps: [
            'Apple 메뉴 → 이 Mac에 관하여에서 Apple Silicon이면 aarch64.dmg, Intel이면 x64.dmg를 고르세요.',
            'DMG와 checksums.txt를 받아 shasum -a 256을 비교한 뒤 AioLM을 응용 프로그램 폴더로 끌어다 놓습니다.',
            '실행이 차단되면 시스템 설정 → 개인정보 보호 및 보안 → 확인 없이 열기(macOS 13–14는 Control-클릭 → 열기)를 선택하세요.',
          ],
          note: 'macOS 13.3 이상 지원. Apple 공증을 받지 않은 앱이므로 실행 전 공식 릴리스와 SHA-256을 확인하세요.',
        },
        {
          id: 'linux',
          title: 'Linux에서 설치',
          downloads: 'linux',
          body: ['Ubuntu 24.04+ x86_64 기준입니다. 앱 메뉴 통합에는 DEB를 권장합니다.'],
          steps: [
            'DEB와 checksums.txt를 받아 sha256sum 확인 후 실행하거나 sudo apt install ./AioLM_*_amd64.deb를 실행하세요.',
            '설치 후 앱 메뉴에서 AioLM을 엽니다.',
          ],
          more: [
            {
              title: 'DEB를 눌러도 설치 창이 열리지 않을 때',
              body: ['다운로드 폴더에 설치할 DEB 파일 하나만 두고 터미널에서 위 apt 명령을 실행하세요.'],
            },
            {
              title: 'AppImage로 실행하기',
              body: [
                'AppImage를 고정 폴더에 두고 체크섬 확인 후 libgomp1, libfuse2t64, zenity(MCP 승인 창용)를 설치하세요.',
                '메뉴 등록은 같은 릴리스의 register-linux-desktop.py를 검증 후 python3 register-linux-desktop.py --appimage <파일>로 실행합니다(DEB 전환 전 --remove).',
              ],
              code: 'sudo apt install libgomp1 libfuse2t64 zenity\nchmod +x ./AioLM_*.AppImage\n./AioLM_*.AppImage',
            },
          ],
        },
        {
          id: 'first-open',
          title: '첫 실행 화면',
          body: ['처음 실행하면 언어·테마·모델 폴더 설정이 열리며, 기존 설정이 있으면 바로 작업 공간이 열립니다.'],
          image: 'language',
          caption: '첫 실행 언어 선택 화면.',
        },
        {
          id: 'verify',
          title: '체크섬으로 파일 확인',
          body: ['설치 파일을 실행하기 전에 같은 릴리스의 checksums.txt와 SHA-256 해시를 비교하세요.'],
          more: [{
            title: 'OS별 SHA-256 확인 명령',
            body: ['Windows는 아래 PowerShell 명령, Mac은 shasum -a 256, Linux는 sha256sum을 사용합니다. 값이 다르면 설치하지 마세요.'],
            code: `Get-FileHash -Algorithm SHA256 .\\AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`,
          }],
        },
        {
          id: 'updates',
          title: '업데이트 및 트레이 동작',
          points: [
            '앱 시작 시 GitHub 릴리스를 한 번 확인해 알림만 띄우며 자동 설치하지 않습니다(수동 확인: 설정 → 일반 → 앱 업데이트).',
            '다운로드 및 설치 시 릴리스 SHA-256을 검증한 뒤 실행 작업을 멈추고 설치 파일을 엽니다(AppImage는 수동 업데이트).',
            '창을 닫으면 시스템 트레이로 숨겨집니다. 프로세스를 멈추려면 앱 종료를 누르세요. 데이터는 ~/.aiolm(Windows: %USERPROFILE%\\.aiolm) 또는 AIOLM_HOME에 보관됩니다.',
          ],
          image: 'updates',
          caption: '설정의 앱 업데이트 화면.',
          more: [{
            title: '제거 및 데이터 유지',
            body: ['NSIS만 명시적 데이터 삭제를 제공하며 MSI·DEB·Mac 휴지통 이동은 데이터를 남깁니다. Mac 업데이트 후에는 Keychain 접근 권한을 다시 물을 수 있습니다.'],
          }],
        },
      ],
    },
    'getting-started': {
      title: '첫 대화 시작하기',
      description: '초기 설정부터 엔진 준비, 모델 다운로드, 채팅까지 순서대로 진행합니다.',
      sections: [
        {
          id: 'language',
          title: '1. 언어 선택 및 초기 설정',
          diagram: 'setup-flow',
          body: ['한국어를 고르고 계속을 누르세요. 이미 설정한 경우 4번으로 건너뛰세요.'],
          image: 'language',
          caption: '언어를 고르면 화면 문구가 즉시 바뀝니다.',
        },
        {
          id: 'theme',
          title: '2. 화면 색상 선택',
          body: ['라이트·다크·시스템 중 선택하세요. 설정에서 언제든 바꿀 수 있습니다.'],
          image: 'theme',
          caption: '테마 미리보기.',
        },
        {
          id: 'folder',
          title: '3. 모델 저장 폴더 지정',
          body: ['기본 폴더를 쓰거나 다른 폴더를 고른 뒤 AioLM 시작하기를 누르세요.'],
          image: 'folder',
          caption: '내 컴퓨터의 실제 폴더를 선택하세요.',
        },
        {
          id: 'engine',
          title: '4. 추론 엔진 준비',
          body: ['왼쪽 추론 엔진 관리에서 OS·장치 조건을 확인하고 사용할 런타임을 설치하거나 연결하세요.'],
          points: [
            '목록에 실제 설치·등록된 버전이 표시되며 실행 파일 검사는 자동으로 실행됩니다(수동 확인 버튼 없음).',
            '자동 vLLM·mlx-vlm 설치가 지원되지 않는 환경에서는 직접 준비한 Python 환경을 등록해 사용하세요.',
            '데스크톱의 모든 help 실행에는 정확한 프로그램·인수·디렉터리·환경에 대한 네이티브 OS 승인이 필요하며, PR 소스 빌드는 사용자 권한으로 컴파일합니다.',
          ],
          image: 'llama-install',
          caption: '네이티브 macOS llama.cpp Metal 런타임 화면.',
          links: [{ href: '/ko/guides/adapters#find', label: '외부 엔진 연결 순서 보기' }],
        },
        {
          id: 'download',
          title: '5. 모델 검색 및 다운로드',
          body: ['찾아보기는 선택한 엔진과 무관하게 모든 형식의 Hugging Face 저장소를 검색합니다.'],
          points: [
            'HF/MLX Safetensors 가중치를 고르면 필요한 설정·토크나이저·분할 조각만 함께 받으며, GGUF 분할 모델도 한 번에 받습니다.',
            '속도·남은 시간 확인, 일시 중지·이어받기(대기 중 다운로드), 전체 파일 다이제스트 검증 및 저장소별 파일 조회 재시도를 지원합니다.',
            '모델을 내려받는 동안에도 추론 엔진을 설치할 수 있습니다.',
          ],
          image: 'model-files',
          caption: '저장소 카드와 파일을 확인한 뒤 받으세요.',
          more: [{
            title: '다운로드 및 리디렉션 보안',
            body: ['원격 Python·모델 코드는 실행용으로 받지 않습니다. GitHub·Hugging Face 전송은 모든 리디렉션(최대 10홉)에서 HTTPS와 신뢰 호스트를 검사하며, 해시가 없는 파일은 이어받기 시 처음부터 다시 받습니다.'],
          }],
        },
        {
          id: 'library',
          title: '6. 라이브러리로 세션 관리',
          body: ['기본 실행 세션은 상단 표시줄과 채팅에서 제어하고, 이름 있는 세션과 로컬 모델 파일은 라이브러리 → 저장된 세션에서 관리합니다.'],
          points: [
            '모델 이름·모델 설정으로 설정을 미리 보고, 복사·삭제·업데이트는 파일 작업 행에서 실행합니다.',
            '검색 결과가 숨겨진 보조 파일뿐이면 필터를 유지한 채 모델 보조 파일 표시를 누르세요.',
            '모델 업데이트는 변경 없는 파일을 재사용합니다(세션 중지 필수, 단일 GGUF 파일 변경 시 전체 재다운로드).',
          ],
          image: 'model-library',
          caption: '저장된 세션과 로컬 모델 목록.',
        },
        {
          id: 'model',
          title: '7. 설정 저장 및 실행',
          diagram: 'memory-pools',
          body: ['모델 설정은 런타임 선택 → 프로필 선택 → 옵션 조정 순서를 따르며, 런타임이 비어 있으면 사용 가능한 첫 항목을 자동 선택합니다.'],
          points: [
            '프로필 저장 후 시작을 누르면 설정 창이 자동으로 닫히고 백그라운드에서 검사·로드를 진행합니다(취소 및 실패 시 저장된 모델 설정 검토 지원).',
            '옵션 제목은 기본 CLI 플래그 또는 JSON 키를 표시하며(마우스 오버 시 전체 서명), 단순 옵션은 다단·복잡한 편집기는 전체 너비를 씁니다.',
            'VRAM·실행 보조 RAM·RAM 오프로드·SSD 오프로드를 구분해 확인하세요. 공유 메모리 GPU는 중복 합산을 표시하지 않습니다.',
          ],
          image: 'model-settings',
          caption: `이전 v${SCREENSHOT_SOURCE_VERSION} 설정 화면 예시. v${DESKTOP_RELEASE_VERSION}은 넓은 창에서 다단 레이아웃을 활용합니다.`,
          more: [{
            title: '메모리 추정, 오래된 옵션 및 제한 시간',
            body: [
              '추정치는 지원되는 llama.cpp 구성(일부 Qwen 하이브리드 포함)에만 제공되며 미지원 구성은 계산 불가로 표시됩니다. 회수 가능한 OS 파일 캐시는 고정 RAM에 넣지 않습니다.',
              '비 llama.cpp 엔진의 오래된 옵션은 옵션 재확인(로드 오류 시 재시도 포함)을 제공합니다. 시작·워밍업 제한은 최대 10분이며, Windows 조기 종료 시 누락·손상된 DLL을 안내합니다.',
            ],
          }],
        },
        {
          id: 'chat',
          title: '8. 로드된 세션으로 대화',
          body: ['채팅을 열고 상단 세션 선택기에서 답변할 세션을 고른 뒤 질문을 보내세요(API 서버 불필요).'],
          points: [
            '도구 승인·진행 상태·오류는 요청한 대화에만 표시되며, 다른 대화를 볼 때는 돌아가기 버튼으로 오작동을 막습니다.',
            '대화 설정에서 문서 검색과 로컬 ffmpeg 기반 음성·영상 전처리를 켤 수 있고, 프로젝트 문서 연결은 네이티브 접근 승인을 받습니다.',
            'MCP 서버는 첫 실행 시 네이티브 OS 승인이 필요하며, 명령 입력 시 공백을 유지하고 저장 전 경고를 표시합니다.',
          ],
          image: 'chat',
          caption: '로컬 모델과 나눈 채팅 화면.',
        },
        {
          id: 'api',
          title: '로컬 API 서버',
          body: ['외부 연동 → API 서버에서 모델과 독립적으로 실행합니다. OpenAI(Responses 도구 포함)와 Anthropic Messages가 127.0.0.1:8080을 공유합니다.'],
          points: [
            '루프백 Host 헤더(그 외 HTTP 421)와 최대 64 연결을 강제하며, 로드된 모델이 없으면 HTTP 503을 반환합니다.',
            '로드된 엔진이 함수 호출을 지원하면 Responses·Anthropic 함수 도구를 Chat Completions로 변환합니다.',
          ],
          more: [{
            title: 'API 키 수명 및 macOS PATH 주의사항',
            body: ['API 키는 앱 종료 전까지 유지되며, API를 꺼도 내부 채팅은 계속 동작합니다. Mac의 Finder·Dock 실행은 셸 설정을 읽지 않으므로 nvm 등의 MCP 도구는 절대 경로를 지정하세요.'],
          }],
        },
        {
          id: 'personalization',
          title: '개인 맞춤 설정과 스킬',
          body: ['설정 → 개인 맞춤 설정에서 ~/.agents/AGENTS.md, ~/.aiolm/AGENTS.md 지침과 로컬 스킬을 관리합니다.'],
          points: [
            '충돌 시 AioLM 파일·스킬이 우선하며, $skill-name 직접 호출은 모든 엔진에서 동작합니다.',
            '모델의 자동 스킬 조회(aiolm_read_skill)는 도구 호출을 선언한 엔진에서만 활성화됩니다.',
          ],
          more: [{
            title: '파일 용량 제한 및 편집 보호',
            body: ['파일당 64 KiB, 유효 스킬 128개 제한(1,024자 초과 설명은 축약). 지침·스킬은 선택한 채팅 엔드포인트로만 전송되며 환경설정 내보내기에는 포함되지 않습니다.'],
          }],
        },
        {
          id: 'benchmarks',
          title: '벤치마크 및 공개 공유',
          body: ['새 벤치마크는 출력 길이 제어를 지원하는 엔진(네이티브 llama.cpp, 지원 비 Metal vLLM)에서 고정 출력 API 테스트로 측정합니다.'],
          points: [
            'vllm-metal·MLX·자동 외부 연결은 고정 출력 벤치마크를 실행할 수 없으며, 이전 상한 및 토큰 방식 결과는 별도 보관됩니다.',
            '실행 중인 세션을 먼저 중지하세요. 주요 설정의 옵션 수락은 자동 실행 없이 지원 확인만 다시 수행합니다.',
            '공유 결과는 웹사이트에서 관리로 수정·삭제하며, 복사한 복구 코드는 클립보드가 같으면 60초 뒤 자동 삭제됩니다.',
          ],
          more: [{
            title: '측정 기준 및 프로필 가져오기',
            body: ['시간과 출력 바이트는 클라이언트 관측값이며 모든 요청이 목표 토큰 수와 일치해야 합니다. 결과에서 프로필을 만들면 호환 실행 설정만 복사됩니다.'],
          }],
        },
        {
          id: 'cli',
          title: 'CLI와 이동용 런타임',
          body: ['aiolm-cli가 앱 폴더(Mac: AioLM.app/Contents/MacOS/aiolm-cli)에 함께 포함됩니다.'],
          code: 'aiolm-cli runtime list\naiolm-cli runtime select <backend> <build>\naiolm-cli server start|status|logs|stop\naiolm-cli runtime discover [folder]\naiolm-cli runtime connect <candidate-id> <model-id> [folder]',
          more: [{
            title: 'CLI 설정, 로그 및 이동용 번들',
            body: [
              '헤드리스 서버는 API 키 없이 루프백으로 열리므로 신뢰된 PC에서만 쓰세요. server logs는 최신 로그만 유지합니다.',
              'config set은 저장 전에 설정을 검증합니다. 관리형 Python은 사전 빌드 패키지만 사용하며, runtime export/import는 모델 없이 의존성만 묶습니다.',
            ],
          }],
        },
      ],
    },
    compatibility: {
      title: '내 컴퓨터에 맞는 엔진 고르기',
      description: '운영체제·가속기·모델 형식·벤치마크 지원 여부를 표로 한눈에 비교하세요.',
      sections: [
        {
          id: 'engines',
          title: '엔진 목록 확인',
          body: ['왼쪽 추론 엔진 관리에서 「이 기기에서 사용할 수 없음」으로 표시된 엔진은 제외하고 고르세요.'],
          image: 'engines',
          caption: '추론 엔진 관리의 기기 지원 및 설치 상태.',
        },
        {
          id: 'choose',
          title: '엔진별 호환성 표',
          table: {
            headers: ['엔진', '지원 OS · 모델 형식 · 고정 출력 벤치마크'],
            rows: [
              ['llama.cpp', 'Windows · macOS · Linux · GGUF · 고정 출력 지원'],
              ['vLLM', '지원 Linux CUDA/ROCm · Safetensors · 고정 출력 지원(비 Metal)'],
              ['vLLM · vllm-metal', 'Apple Silicon macOS 15+ · Safetensors / 제한적 GGUF · 미지원'],
              ['MLX', 'Apple Silicon macOS · MLX Safetensors · 미지원'],
              ['외부 추론 엔진', '로컬 OpenAI v1 서버 또는 설치 폴더 · 채팅/스트리밍 검증 · 미지원'],
            ],
          },
          note: 'Intel Mac에서는 CPU llama.cpp만 사용할 수 있으며 MLX·vllm-metal은 지원하지 않습니다.',
        },
        {
          id: 'models',
          title: '모델 형식 및 Python 환경',
          points: [
            'llama.cpp는 GGUF, vLLM·MLX는 완전한 config·tokenizer·processor·safetensors 파일 세트가 필요합니다.',
            '자동 vLLM·mlx-vlm 설치는 사전 빌드 패키지만 사용하므로, 호환 패키지가 없으면 외부 Python 환경을 준비해 등록하세요.',
            '임베딩 모델은 임베딩 세션, Whisper·Qwen3-ASR은 음성 세션을 사용합니다(WAV 외 입력은 로컬 ffmpeg 필요).',
          ],
          image: 'discover',
          caption: '모델 탐색은 선택한 실행 엔진과 독립적으로 동작합니다.',
        },
        {
          id: 'limits',
          title: '검증 범위 및 알려진 문제',
          body: ['이미지·음성·영상·도구 기능은 엔진과 모델이 모두 지원해야 사용할 수 있습니다.'],
          more: [{
            title: `v${DESKTOP_RELEASE_VERSION} 검증 제한 및 알려진 문제`,
            body: [
              '고정 출력 벤치마크는 출력 길이 제어를 선언한 엔진(네이티브 llama.cpp, 지원 비 Metal vLLM)에서만 실행됩니다.',
              'v0.3.2에서 보고된 SmolVLM 이미지·영상 품질 문제(F09)는 수정 여부가 미확인 상태입니다.',
              '앱과 공개 CLI는 CPU 기준 수치 검증을 제공하지 않습니다.',
            ],
          }],
        },
      ],
    },
    adapters: {
      title: '외부 추론 엔진 연결하기',
      description: '자동 찾기 → 항목 확인 → 모델 선택 → 연결까지 4단계로 연결합니다.',
      sections: [
        {
          id: 'prepare',
          title: '연결 흐름 한눈에 보기',
          diagram: 'adapter-flow',
          body: ['로컬 OpenAI 호환 v1 서버나 설치 폴더를 JSON 작성 없이 바로 연결합니다.'],
        },
        {
          id: 'find',
          title: '1. 찾기 및 승인',
          body: ['추론 엔진 관리 → 추론 엔진 추가 → 자동 찾기를 열거나 설치 폴더 선택을 누르세요.'],
          points: [
            '폴더 검색은 실행 가능한 프로그램만 자동으로 찾으며(DLL 등 제외) 특정 엔진 이름을 우대하지 않습니다.',
            '실행 중인 서버가 하나면 자동 확인할 수 있지만, 폴더 항목은 반드시 선택 항목 확인을 눌러야 합니다.',
            '데스크톱 help 실행에는 정확한 명령·인수·디렉터리·환경에 대한 네이티브 OS 승인이 필요합니다(취소 시 대기 창도 철회).',
          ],
          note: '모델 세션이 실행 중이거나 다른 런타임 작업이 진행 중이면 검색·등록이 잠깁니다.',
          image: 'auto-find',
          caption: '자동 찾기 화면.',
        },
        {
          id: 'choose-model',
          title: '2. 모델 선택',
          body: ['실행 중인 서버가 반환한 모델 목록이나 폴더 설치용 로컬 카탈로그 모델을 고르세요.'],
          points: ['하위 명령으로 서버를 실행하는 프로그램은 실행 명령을 고른 뒤 선택 명령 확인을 누르세요.'],
          image: 'auto-model',
          caption: '외부 엔진 모델 선택 화면.',
        },
        {
          id: 'connect',
          title: '3. 연결 및 검증',
          body: ['연결을 누르면 실제 채팅 응답과 스트리밍 검사를 통과한 경우에만 앱에 저장합니다.'],
          points: [
            '실행 중인 서버는 AioLM 로컬 프록시를 거치므로 연결 중지를 눌러도 원래 서버는 종료되지 않습니다.',
            '자동 연결은 고정 출력 벤치마크 제어를 선언하지 않으며 멀티모달·도구 품질을 보증하지 않습니다.',
          ],
          image: 'auto-connect',
          caption: '연결 검증 완료 화면.',
        },
        {
          id: 'launch-options',
          title: '옵션 구성 및 help 재확인',
          body: ['관리형 연결은 선택한 명령의 실제 도움말로 그룹화된 옵션 편집기를 생성합니다.'],
          points: [
            '단순 옵션은 다단 그리드, JSON·토큰 목록·경로·반복 편집기는 전체 너비를 유지하며 명령 및 도움말 도구를 제공합니다.',
            '검토한 help가 런타임 식별 정보와 일치하지 않을 때(PATH 등 변경 없는 상속 환경 값은 식별에서 제외) 시작 시 검토한 help 명령을 한 번 더 실행해 분석 결과가 같으면 이어받습니다. help 실행은 정확한 프로그램 경로·인수·실제 작업 디렉터리·환경이 이전에 승인된 경우에만 네이티브 확인 창을 건너뛰며, 이 실행 입력 중 하나라도 바뀌면 새로운 네이티브 승인이 필요합니다.',
            'help가 달라졌거나 이전 빌드 확인만 있으면 실행을 멈추고 옵션 재확인이 필요합니다. 프로필 저장 후 시작은 설정 창을 닫고 백그라운드에서 실행·복구를 진행합니다.',
          ],
          more: [{
            title: '추가 실행 인자 및 실행 중인 서버',
            body: ['추가 실행 인자는 셸 구문 없이 리터럴 토큰만 전달하며 중복·앱 관리 플래그는 거부합니다. 이미 실행 중인 서버는 AioLM에서 실행 설정을 바꿀 수 없습니다.'],
          }],
        },
        {
          id: 'unconfirmed',
          title: '연결을 확인하지 못했을 때',
          body: ['통신 규약이 다르거나 인증키·실행 명령이 불명확하면 원인을 표시하고 미확인 상태로 남깁니다.'],
          links: [{ href: '/ko/guides/adapters#files', label: '고급 직접 등록의 파일 안내' }],
          more: [{
            title: '컨테이너 서버',
            body: ['이미 실행 중인 컨테이너가 로컬 OpenAI v1을 제공하면 연결할 수 있습니다. 컨테이너 자동 생성·관리는 지원하지 않습니다.'],
          }],
        },
        {
          id: 'files',
          title: '고급: 직접 등록 파일 역할',
          body: ['자동 찾기로 연결되지 않는 경우에만 아래 파일 구성을 참고하세요.'],
          table: {
            headers: ['항목', '역할'],
            rows: [
              ['*.setup.json', '제공자가 만든 입력 양식(동반 스크립트와 함께 보관)'],
              ['등록 manifest (*.engine.json)', '완성된 등록 JSON을 가져올 때만 선택'],
              ['서버 실행 파일', '설치기·바로가기가 아닌 실제 서버 바이너리'],
              ['Python 인터프리터', '엔진이 설치된 환경의 python.exe 또는 bin/python'],
              ['모델·일반 설정', '등록 후 선택(.gguf, .safetensors, deployment.json 등)'],
            ],
          },
          note: '직접 등록 시 .engine.json을 따로 만들 필요 없이 앱 내부에 저장됩니다.',
        },
        {
          id: 'advanced',
          title: '고급: 직접 등록 절차',
          body: ['실행 파일·브리지·probe 스크립트를 수동으로 지정해야 할 때만 펼쳐 보세요.'],
          more: [
            {
              title: '1. 등록 화면 열기 및 경로 승인',
              body: ['모델 중지 → 추론 엔진 추가 → 고급을 여세요. 네이티브 파일 선택기로 고른 manifest는 세션 허가되며, 직접 입력한 경로는 probe·실행 명령 확인 창을 거칩니다.'],
              image: 'adapter-add',
              caption: '고급 직접 등록 진입 화면.',
            },
            {
              title: '2. 연결 설정 파일 가져오기 (*.setup.json)',
              steps: ['AioLM 연결 설정 가져오기 (.json)로 파일을 고릅니다(네이티브 선택기 세션 토큰과 결합).', '경로를 채운 뒤 설치 정보 확인하고 계속을 누르세요.'],
              code: '받은 폴더/\n  engine.setup.json\n  prepare.py\n  probe.py',
              body: ['동반 스크립트는 같은 폴더에 함께 보관하세요.'],
            },
            {
              title: '3. 실행 파일 및 인자 입력',
              body: ['실행 파일·Python을 선택하고 custom.<엔진> 및 런타임 ID와 HTTP/브리지 방식을 지정합니다.'],
              image: 'adapter-setup',
              caption: '실행 방법 입력 화면.',
              code: '실행 파일: bin/python\n인자 1: -m\n인자 2: vendor_engine.serve',
            },
            {
              title: '4. 도움말 및 probe 설정',
              body: ['도움말 탐색을 실행하고 모델·포트 옵션과 AioLM JSON probe(schema_version: 1)를 연결하세요.'],
              image: 'adapter-help',
              caption: '도움말 탐색 단계.',
            },
            {
              title: '5. 호환성·상태 검사 검토',
              body: ['probe JSON과 HTTP/SSE·상태 확인 경로를 검토한 뒤 등록을 저장하세요.'],
              image: 'adapter-check',
              caption: '모델·포트 및 호환성 검사 검토.',
            },
            {
              title: '6. 저장 후 모델 실행 테스트',
              steps: ['등록 내용 검토 → 등록을 누릅니다.', '새 엔진·런타임으로 모델을 실행해 응답·취소·재시작을 확인하세요.'],
              image: 'adapter-review',
              caption: '최종 검토 화면.',
              body: [],
            },
          ],
        },
        {
          id: 'trouble',
          title: '문제 해결',
          more: [
            { title: 'Python·파일을 찾을 수 없음', body: ['엔진 환경의 Python을 선택하고 어댑터 폴더 전체를 함께 유지하세요.'] },
            { title: '등록은 됐지만 실행 실패', body: ['모델 형식·전체 파일·메모리·서버 로그를 확인하세요.'] },
            { title: '등록 삭제 시 영향', body: ['외부 등록 삭제는 AioLM 내부 기록만 지우며 엔진·모델 파일은 삭제하지 않습니다.'] },
          ],
        },
      ],
    },
  },
};

export default content;
