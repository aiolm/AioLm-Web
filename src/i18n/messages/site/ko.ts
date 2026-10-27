import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 다양한 추론 엔진을 하나의 작업 공간에서",
  "site.description": "AioLM(All-in-One LM)은 llama.cpp·vLLM·MLX와 Strata·TensorFold 등 외부 추론 엔진을 연결하는 엔진 중립 GUI 어댑터입니다. 모델·설정·로컬 채팅을 하나의 작업 공간에서 관리하세요.",
  "site.skip": "본문으로 건너뛰기",
  "site.primary": "주 탐색",
  "site.home": "홈",
  "site.benchmarks": "벤치마크",
  "site.manage": "관리",
  "site.github": "GitHub에서 보기",
  "site.tagline": "기본 제공 엔진과 외부 추론 엔진을 하나의 GUI에서.",
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
