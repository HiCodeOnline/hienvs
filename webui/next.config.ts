import type { NextConfig } from 'next'

// 静态导出：产物输出到 out/，可托管在任意静态站点；各地区的软件源 JSON 随 public/ 一并输出，
// 客户端远程软件源地址即 <站点根>/<region>/index.json。
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true }
}

export default nextConfig
