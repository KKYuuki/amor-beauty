/**
 * Test script to verify rate limiting is working correctly
 * Usage: bun run scripts/test-rate-limit.ts
 */

interface TestResult {
    endpoint: string
    requests: number
    rateLimited: number
    passed: boolean
}

async function testEndpoint(
    endpoint: string,
    limit: number,
    requestsToMake: number
): Promise<TestResult> {
    console.log(`\nTesting ${endpoint} (limit: ${limit} req/min)...`)
    
    let rateLimitedCount = 0
    const responses: Response[] = []
    
    // Make requests
    for (let i = 0; i < requestsToMake; i++) {
        try {
            const response = await fetch(endpoint)
            responses.push(response)
            
            if (response.status === 429) {
                rateLimitedCount++
            }
            
            // Show progress every 10 requests
            if ((i + 1) % 10 === 0) {
                process.stdout.write('.')
            }
        } catch (error) {
            console.error(`\nRequest ${i + 1} failed:`, error)
        }
    }
    
    console.log('')
    
    // Check results
    const successful = responses.filter(r => r.status !== 429).length
    const shouldHaveRateLimited = requestsToMake > limit
    const didRateLimit = rateLimitedCount > 0
    
    console.log(`  Requests made: ${requestsToMake}`)
    console.log(`  Successful: ${successful}`)
    console.log(`  Rate limited (429): ${rateLimitedCount}`)
    console.log(`  Expected rate limiting: ${shouldHaveRateLimited ? 'YES' : 'NO'}`)
    console.log(`  Actually rate limited: ${didRateLimit ? 'YES' : 'NO'}`)
    
    // Test passes if:
    // - If requests > limit, we should see some 429s
    // - If requests <= limit, we should see no 429s
    const passed = shouldHaveRateLimited === didRateLimit || (!shouldHaveRateLimited && !didRateLimit)
    
    return {
        endpoint,
        requests: requestsToMake,
        rateLimited: rateLimitedCount,
        passed
    }
}

async function main() {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    console.log('='.repeat(60))
    console.log('Rate Limiting Test Suite')
    console.log('='.repeat(60))
    console.log(`Base URL: ${baseUrl}`)
    console.log('')
    
    const results: TestResult[] = []
    
    // Test 1: Health check endpoint (60 req/min)
    results.push(await testEndpoint(
        `${baseUrl}/api/alive`,
        60,
        70
    ))
    
    // Test 2: Public hours endpoint (100 req/min)
    results.push(await testEndpoint(
        `${baseUrl}/api/public/hours`,
        100,
        110
    ))
    
    // Test 3: Public artists endpoint (100 req/min)
    results.push(await testEndpoint(
        `${baseUrl}/api/public/artists/available`,
        100,
        110
    ))
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('Test Summary')
    console.log('='.repeat(60))
    
    let allPassed = true
    for (const result of results) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL'
        console.log(`${status}: ${result.endpoint}`)
        if (!result.passed) allPassed = false
    }
    
    console.log('\n' + '='.repeat(60))
    if (allPassed) {
        console.log('✅ All tests passed!')
        process.exit(0)
    } else {
        console.log('❌ Some tests failed')
        process.exit(1)
    }
}

main().catch((error) => {
    console.error('Test failed:', error)
    process.exit(1)
})
