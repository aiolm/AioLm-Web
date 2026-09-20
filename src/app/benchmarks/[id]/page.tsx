import { BenchmarkDetail } from "@/components/benchmark-detail";

export const dynamic = "force-dynamic";

export default async function BenchmarkPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  return <BenchmarkDetail publicId={id} />;
}
