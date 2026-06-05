import type { NextConfig } from "next"

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            new URL('https://s3.devgo.studio/**')
        ]
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
    transpilePackages: [
    ]
}

export default nextConfig
