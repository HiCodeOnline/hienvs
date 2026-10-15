import { notFound } from 'next/navigation'
import { RegionCatalog } from '@/components/RegionCatalog'
import { getIndex, getTools } from '@/lib/registry'
import { getRegion, isValidRegion, regionCodes } from '@/lib/regions'

export function generateStaticParams() {
  return regionCodes().map((region) => ({ region }))
}

export default async function RegionPage({ params }: { params: Promise<{ region: string }> }) {
  const { region: code } = await params
  if (!isValidRegion(code)) notFound()

  const region = getRegion(code)
  if (!region) notFound()

  return <RegionCatalog region={region} index={getIndex(code)} tools={getTools(code)} />
}
