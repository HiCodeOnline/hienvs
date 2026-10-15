import { RegionLanding } from '@/components/RegionLanding'
import { getIndex } from '@/lib/registry'
import { getRegionConfig, listRegions } from '@/lib/regions'

export default function HomePage() {
  const regions = listRegions()
  const { defaultRegion } = getRegionConfig()
  const toolCounts = Object.fromEntries(regions.map((r) => [r.code, getIndex(r.code).tools.length]))

  return <RegionLanding regions={regions} defaultRegion={defaultRegion} toolCounts={toolCounts} />
}
