import type { EnglishMessages } from './en';
const messages = {
  "site.title": "AioLM — 多様な推論エンジンをひとつのワークスペースで",
  "site.description": "AioLM（All-in-One LM）はllama.cpp・vLLM・MLXと外部推論エンジンをひとつの作業空間で使うGUIアダプターです。モデル・設定・ローカルチャットをまとめて管理できます。",
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
