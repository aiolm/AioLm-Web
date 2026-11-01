import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 多様な推論エンジンをひとつのワークスペースで",
  "site.description": "AioLMでllama.cpp・vLLM・MLXと互換外部エンジンをひとつに。エンジンに依存しないモデル検索、ロード済みモデル管理、パーソナライズしたチャット、プロジェクト、ローカルAPIサーバー。",
  "site.skip": "本文へスキップ",
  "site.primary": "メインナビゲーション",
  "site.home": "ホーム",
  "site.benchmarks": "ベンチマーク",
  "site.manage": "管理",
  "site.github": "GitHubで見る",
  "site.tagline": "基本エンジンと外部推論エンジンをひとつのGUIで。",
  "site.project": "プロジェクト",
  "site.docs": "ガイド",
  "site.license": "MITライセンス",
  "site.language": "言語",
  "site.languageHint": "言語を変更すると、このページが選択した言語で開きます。",
  "site.notFound": "ページが見つかりません",
  "site.notFoundDetail": "このページは存在しないか、公開が終了しています。",
  "site.returnHome": "ホームに戻る"
} satisfies Record<keyof EnglishMessages, string>;
export default messages;
