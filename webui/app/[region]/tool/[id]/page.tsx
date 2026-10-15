import { notFound } from 'next/navigation'
import { ToolDetailView } from '@/components/ToolDetailView'
import { getTool, getTools } from '@/lib/registry'
import { getRegion, regionCodes } from '@/lib/regions'

export function generateStaticParams() {
  return regionCodes().flatMap((region) =>
    getTools(region).map((tool) => ({ region, id: tool.id }))
  )
}

export default async function ToolPage({ params }: { params: Promise<{ region: string; id: string }> }) {
  const { region: code, id } = await params
  const region = getRegion(code)
  const tool = region ? getTool(code, id) : undefined
  if (!region || !tool) notFound()

  return <ToolDetailView region={region} tool={tool} />
}
