import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 多种推理引擎，一个工作空间",
  "site.description": "AioLM 统一连接 llama.cpp、vLLM、MLX 和兼容的外部引擎，在一个工作空间中使用引擎中立的模型搜索、已加载模型管理、个性化聊天、项目和本地 API 服务器。",
  "site.skip": "跳转到主要内容",
  "site.primary": "主导航",
  "site.home": "首页",
  "site.benchmarks": "基准测试",
  "site.manage": "管理",
  "site.github": "在 GitHub 上查看",
  "site.tagline": "在一个 GUI 中使用内置和外部推理引擎。",
  "site.project": "项目",
  "site.docs": "使用指南",
  "site.license": "MIT 许可证",
  "site.language": "语言",
  "site.languageHint": "更改语言后，将以所选语言打开此页面。",
  "site.notFound": "找不到页面",
  "site.notFoundDetail": "此页面不存在或已不可用。",
  "site.returnHome": "返回首页"
} satisfies Record<keyof EnglishMessages, string>;
export default messages;
