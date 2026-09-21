import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 로컬 모델을 하나의 작업 공간에서.",
  "site.description": "AioLM(All In One LM)은 llama.cpp용 데스크톱 작업 공간입니다. GGUF 모델을 탐색하고 런타임을 관리하며 로컬에서 대화하고 성능을 측정하세요. 사용자가 공유한 벤치마크와 전체 실행 환경을 살펴보세요.",
  "site.skip": "본문으로 건너뛰기",
  "site.primary": "주 탐색",
  "site.home": "홈",
  "site.benchmarks": "벤치마크",
  "site.manage": "관리",
  "site.github": "GitHub에서 보기",
  "site.tagline": "llama.cpp 로컬 언어 모델을 위한 데스크톱 작업 공간.",
  "site.project": "프로젝트",
  "site.docs": "문서",
  "site.license": "MIT 라이선스",
  "site.language": "언어",
  "site.languageHint": "언어를 변경하면 이 페이지가 선택한 언어로 열립니다.",
  "site.notFound": "페이지를 찾을 수 없습니다",
  "site.notFoundDetail": "페이지가 존재하지 않거나 더 이상 제공되지 않습니다.",
  "site.returnHome": "홈으로 돌아가기"
} satisfies Record<keyof EnglishMessages, string>;
export default messages;
