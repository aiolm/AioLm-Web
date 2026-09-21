import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 本地模型，一个工作空间。",
  "site.description": "AioLM（All-in-One LM）是用于 llama.cpp 的桌面工作空间：探索 GGUF 模型、管理运行时、本地聊天并测量性能。查看用户自行提交的公开基准测试及其完整配置。",
  "site.skip": "跳转到主要内容",
  "site.primary": "主导航",
  "site.home": "首页",
  "site.benchmarks": "基准测试",
  "site.manage": "管理",
  "site.github": "在 GitHub 上查看",
  "site.tagline": "用于 llama.cpp 本地语言模型的桌面工作空间。",
  "site.project": "项目",
  "site.docs": "文档",
  "site.license": "MIT 许可证",
  "site.language": "语言",
  "site.languageHint": "更改语言后，将以所选语言打开此页面。",
  "site.notFound": "找不到页面",
  "site.notFoundDetail": "此页面不存在或已不可用。",
  "site.returnHome": "返回首页"
} satisfies Record<keyof EnglishMessages, string>;
export default messages;
