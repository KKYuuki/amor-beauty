#!/usr/bin/env bun
/**
 * Script to detect inconsistent return patterns in server actions
 * Run: bun run scripts/check-action-types.ts
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

interface Inconsistency {
    file: string
    function: string
    line: number
    pattern: string
    suggestion: string
}

const actionDir = join(process.cwd(), 'server', 'actions')

async function checkActionTypes() {
    console.log('🔍 Checking server action return patterns...\n')
    
    const files = await readdir(actionDir)
    const tsFiles = files.filter(f => f.endsWith('.ts') && f !== 'types.ts')
    
    const inconsistencies: Inconsistency[] = []
    
    for (const file of tsFiles) {
        const content = await readFile(join(actionDir, file), 'utf-8')
        const lines = content.split('\n')
        
        // Track async functions and their return types
        let currentFunction: string | null = null
        let currentLine = 0
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            
            // Match async function declarations
            const funcMatch = line.match(/export\s+async\s+function\s+(\w+)\s*[\(:]/)
            if (funcMatch) {
                currentFunction = funcMatch[1]
                currentLine = i + 1
                
                // Check return type annotation
                const returnTypeMatch = line.match(/Promise\s*\<\s*([^>]+)\s*\>/)
                if (returnTypeMatch) {
                    const returnType = returnTypeMatch[1].trim()
                    
                    // Check for non-standard patterns
                    if (!returnType.includes('ActionResponse') && 
                        !returnType.includes('void')) {
                        
                        // Check if it's a primitive return type
                        const primitives = ['string', 'number', 'boolean', 'string[]', 'number[]', 'boolean[]']
                        const isPrimitive = primitives.some(p => 
                            returnType === p || returnType.includes(`| ${p}`) || returnType.includes(`${p} |`)
                        )
                        
                        if (isPrimitive || returnType.includes('[]') || returnType.includes(' | ')) {
                            inconsistencies.push({
                                file,
                                function: currentFunction,
                                line: currentLine,
                                pattern: returnType,
                                suggestion: `Should use ActionResponse<${returnType}>`
                            })
                        }
                    }
                }
            }
        }
    }
    
    // Report findings
    if (inconsistencies.length === 0) {
        console.log('✅ All action functions use standardized ActionResponse types!')
    } else {
        console.log(`⚠️  Found ${inconsistencies.length} inconsistent return patterns:\n`)
        
        // Group by file
        const byFile = inconsistencies.reduce((acc, inc) => {
            if (!acc[inc.file]) acc[inc.file] = []
            acc[inc.file].push(inc)
            return acc
        }, {} as Record<string, Inconsistency[]>)
        
        for (const [file, issues] of Object.entries(byFile)) {
            console.log(`\n📄 ${file}:`)
            for (const issue of issues) {
                console.log(`  Line ${issue.line}: ${issue.function}()`)
                console.log(`    Pattern: ${issue.pattern}`)
                console.log(`    Suggestion: ${issue.suggestion}`)
            }
        }
        
        console.log(`\n📊 Summary: ${inconsistencies.length} functions need migration`)
        console.log('\nNext steps:')
        console.log('1. Update these functions to use ActionResponse<T>')
        console.log('2. Use success(data) and failure(error) helper functions')
        console.log('3. Run this script again to verify')
    }
    
    return inconsistencies.length
}

checkActionTypes()
    .then(count => process.exit(count > 0 ? 1 : 0))
    .catch(err => {
        console.error('Error:', err)
        process.exit(1)
    })
