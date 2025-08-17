import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, it } from 'node:test'
import { extractStrings } from './extract'

interface PerformanceMetrics {
	readonly formatType: string
	readonly fileName: string
	readonly fileSize: number
	readonly lineCount: number
	readonly extractionTimeMs: number
	readonly extractedCount: number
	readonly throughputLinesPerSecond: number
	readonly throughputMbPerSecond: number
	readonly memoryUsageMb: number
}

interface PerformanceResult {
	readonly metrics: readonly PerformanceMetrics[]
	readonly summary: Readonly<{
		totalFiles: number
		totalExtractionTimeMs: number
		averageExtractionTimeMs: number
		fastestFormat: string
		slowestFormat: string
	}>
}

const PERFORMANCE_FILES = Object.freeze([
	{ name: '500k.csv', format: 'csv' },
	{ name: '500k.json', format: 'json' },
	{ name: '5k.env', format: 'env' },
	{ name: '5k.ini', format: 'ini' },
	{ name: '5k.toml', format: 'toml' },
	{ name: '5k.yaml', format: 'yaml' },
] as const)

function measureMemoryUsage(): number {
	const usage = process.memoryUsage()
	return Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100
}

function getFileStats(filePath: string): { size: number; lineCount: number } {
	const content = readFileSync(filePath, 'utf-8')
	const size = Buffer.byteLength(content, 'utf-8')
	const lineCount = content.split('\n').length
	return { size, lineCount }
}

function runSinglePerformanceTest(fileName: string, format: string): PerformanceMetrics {
	const filePath = join(__dirname, '__performance__', fileName)
	const content = readFileSync(filePath, 'utf-8')
	const { size, lineCount } = getFileStats(filePath)

	// Warm up the extraction function
	extractStrings(content.slice(0, 1000), format)

	// Force garbage collection if available
	if (global.gc) {
		global.gc()
	}

	const memoryBefore = measureMemoryUsage()
	const startTime = performance.now()

	const extracted = extractStrings(content, format)

	const endTime = performance.now()
	const memoryAfter = measureMemoryUsage()

	const extractionTimeMs = Math.round((endTime - startTime) * 100) / 100
	const throughputLinesPerSecond = Math.round((lineCount / extractionTimeMs) * 1000)
	const throughputMbPerSecond = Math.round((size / 1024 / 1024 / extractionTimeMs) * 1000 * 100) / 100

	return Object.freeze({
		formatType: format,
		fileName,
		fileSize: size,
		lineCount,
		extractionTimeMs,
		extractedCount: extracted.length,
		throughputLinesPerSecond,
		throughputMbPerSecond,
		memoryUsageMb: Math.max(0, memoryAfter - memoryBefore),
	})
}

function runPerformanceTests(): PerformanceResult {
	console.log('🚀 Starting Stringle Performance Tests\n')

	const metrics: PerformanceMetrics[] = []

	for (const { name, format } of PERFORMANCE_FILES) {
		console.log(`Testing ${format.toUpperCase()} format with ${name}...`)

		try {
			const metric = runSinglePerformanceTest(name, format)
			metrics.push(metric)

			console.log(`  ✓ Processed ${metric.lineCount.toLocaleString()} lines in ${metric.extractionTimeMs}ms`)
			console.log(`  ✓ Extracted ${metric.extractedCount.toLocaleString()} strings`)
			console.log(`  ✓ Throughput: ${metric.throughputLinesPerSecond.toLocaleString()} lines/sec`)
			console.log('')
		} catch (error) {
			console.error(`  ✗ Failed to test ${name}: ${error}`)
			console.log('')
		}
	}

	const totalExtractionTimeMs = metrics.reduce((sum, m) => sum + m.extractionTimeMs, 0)
	const averageExtractionTimeMs = Math.round((totalExtractionTimeMs / metrics.length) * 100) / 100

	const sortedBySpeed = [...metrics].sort((a, b) => a.extractionTimeMs - b.extractionTimeMs)
	const fastestFormat = sortedBySpeed[0]?.formatType ?? 'unknown'
	const slowestFormat = sortedBySpeed[sortedBySpeed.length - 1]?.formatType ?? 'unknown'

	const summary = Object.freeze({
		totalFiles: metrics.length,
		totalExtractionTimeMs: Math.round(totalExtractionTimeMs * 100) / 100,
		averageExtractionTimeMs,
		fastestFormat,
		slowestFormat,
	})

	return Object.freeze({
		metrics: Object.freeze(metrics),
		summary,
	})
}

function formatPerformanceReport(result: PerformanceResult): string {
	const { metrics, summary } = result

	let report = '# Stringle Performance Test Results\n\n'
	report += `**Test Environment:**\n`
	report += `- Node.js: ${process.version}\n`
	report += `- Platform: ${process.platform} ${process.arch}\n`
	report += `- Date: ${new Date().toISOString()}\n\n`

	report += '## Summary\n\n'
	report += `- **Total Files Tested:** ${summary.totalFiles}\n`
	report += `- **Total Extraction Time:** ${summary.totalExtractionTimeMs}ms\n`
	report += `- **Average Extraction Time:** ${summary.averageExtractionTimeMs}ms\n`
	report += `- **Fastest Format:** ${summary.fastestFormat.toUpperCase()}\n`
	report += `- **Slowest Format:** ${summary.slowestFormat.toUpperCase()}\n\n`

	report += '## Detailed Results\n\n'
	report += '| Format | File | Size | Lines | Time (ms) | Extracted | Lines/sec | MB/sec | Memory (MB) |\n'
	report += '|--------|------|------|-------|-----------|-----------|-----------|--------|-----------|\n'

	for (const metric of metrics) {
		const sizeMb = Math.round((metric.fileSize / 1024 / 1024) * 100) / 100
		report += `| ${metric.formatType.toUpperCase()} | ${metric.fileName} | ${sizeMb}MB | ${metric.lineCount.toLocaleString()} | ${metric.extractionTimeMs} | ${metric.extractedCount.toLocaleString()} | ${metric.throughputLinesPerSecond.toLocaleString()} | ${metric.throughputMbPerSecond} | ${metric.memoryUsageMb} |\n`
	}

	report += '\n## Performance Analysis\n\n'

	// Add format-specific insights
	const formatMetrics = new Map<string, PerformanceMetrics[]>()
	for (const metric of metrics) {
		const existing = formatMetrics.get(metric.formatType) ?? []
		formatMetrics.set(metric.formatType, [...existing, metric])
	}

	for (const [format, formatResults] of formatMetrics) {
		const avgTime = formatResults.reduce((sum, m) => sum + m.extractionTimeMs, 0) / formatResults.length
		const avgExtracted = formatResults.reduce((sum, m) => sum + m.extractedCount, 0) / formatResults.length

		report += `**${format.toUpperCase()}:** `
		report += `Average ${Math.round(avgTime * 100) / 100}ms extraction time, `
		report += `${Math.round(avgExtracted).toLocaleString()} strings extracted on average.\n\n`
	}

	return report
}

describe('Performance Tests', () => {
	it('should run comprehensive performance benchmark', () => {
		const result = runPerformanceTests()
		const report = formatPerformanceReport(result)

		process.stdout.write(`\n${'='.repeat(80)}\n`)
		process.stdout.write(`${report}\n`)
		process.stdout.write(`${'='.repeat(80)}\n\n`)

		// Basic assertions to ensure tests ran successfully
		if (result.metrics.length === 0) {
			throw new Error('No performance metrics collected')
		}

		if (result.summary.totalExtractionTimeMs <= 0) {
			throw new Error('Invalid extraction time measured')
		}

		console.log(`✅ Performance benchmark completed successfully!`)
		console.log(`   Tested ${result.metrics.length} files in ${result.summary.totalExtractionTimeMs}ms`)
	})
})

// Export for use in other tests or scripts
export { formatPerformanceReport, runPerformanceTests }
export type { PerformanceMetrics, PerformanceResult }
