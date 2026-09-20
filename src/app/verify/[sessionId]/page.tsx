import { VerifyPanel } from "@/components/verify-panel";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ sessionId: string }> }): Promise<React.JSX.Element> {
  const { sessionId } = await params;
  return <VerifyPanel sessionId={sessionId} />;
}
