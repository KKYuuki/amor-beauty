import { describe, test, expect, beforeAll } from 'bun:test'
import { uploadFile, deleteFile, isStorageConfigured } from '@/utils/storage'

describe('Storage Utilities', () => {
    beforeAll(() => {
        // Ensure storage is configured for tests
        process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'
        process.env.S3_BUCKET = process.env.S3_BUCKET || 'test-bucket'
        process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'test-key'
        process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'test-secret'
        process.env.S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || 'http://localhost:9000'
    })

    test('isStorageConfigured returns true with valid config', () => {
        expect(isStorageConfigured()).toBe(true)
    })

    test('uploadFile uploads a file successfully', async () => {
        const buffer = Buffer.from('test content')
        const key = `test/${Date.now()}.txt`
        
        const result = await uploadFile(buffer, key, 'text/plain')
        
        expect(result.url).toBeDefined()
        expect(result.key).toBe(key)
    })

    test('deleteFile removes uploaded file', async () => {
        // First upload
        const buffer = Buffer.from('test content')
        const key = `test/${Date.now()}.txt`
        await uploadFile(buffer, key, 'text/plain')
        
        // Then delete
        await deleteFile(key)
        
        // Verify deletion (would need to add getFile function)
        // For now, just ensure no error
    })
})
