import { MetadataRoute } from 'next'
import { routeConfig } from '@/utils/routes-config'

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://inksight.rdmdstudio.com'

    return routeConfig.map((route) => ({
        url: `${baseUrl}${route.href}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: route.href === '/' ? 1 : 0.8,
    }))
}
