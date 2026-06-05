import { NextResponse } from 'next/server'
import { isStorageConfigured, getS3ClientAndConfig } from '@/utils/storage'
import { ListBucketsCommand } from '@aws-sdk/client-s3'

export async function GET() {
    try {
        if (!isStorageConfigured()) {
            return NextResponse.json({
                status: 'error',
                message: 'S3 storage not configured',
                configured: false,
            }, { status: 503 })
        }

        const result = getS3ClientAndConfig()

        if (!result) {
            return NextResponse.json({
                status: 'error',
                message: 'S3 client initialization failed',
                configured: false,
            }, { status: 503 })
        }

        // Try to list buckets to verify connectivity
        const { client } = result
        await client.send(new ListBucketsCommand({}))

        return NextResponse.json({
            status: 'ok',
            message: 'S3 storage is accessible',
            configured: true,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        return NextResponse.json({
            status: 'error',
            message: `S3 storage check failed: ${message}`,
            configured: true,
        }, { status: 503 })
    }
}
