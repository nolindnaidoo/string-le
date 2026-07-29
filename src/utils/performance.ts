import type { StringLeConfig } from '../config/config';

/**
 * Performance monitoring and optimization utilities for String-LE
 * Provides performance metrics, monitoring, and optimization strategies
 */

export interface PerformanceMetrics {
	readonly operation: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly duration: number;
	readonly stringCount: number;
	readonly fileSize: number;
	readonly memoryUsage: number;
	readonly cpuUsage: number;
	readonly throughput: number; // strings/second
	readonly cacheHits: number;
	readonly cacheMisses: number;
}

export interface PerformanceReport {
	readonly metrics: PerformanceMetrics;
	readonly recommendations: readonly string[];
	readonly warnings: readonly string[];
	readonly optimizations: readonly string[];
}

export interface PerformanceThresholds {
	readonly maxDuration: number;
	readonly maxMemoryUsage: number;
	readonly maxCpuUsage: number;
	readonly minThroughput: number;
}

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
	private readonly metrics: PerformanceMetrics[] = [];
	private readonly cache = new Map<
		string,
		{ data: unknown; timestamp: number; hits: number }
	>();
	private readonly thresholds: PerformanceThresholds;

	constructor(thresholds: PerformanceThresholds) {
		this.thresholds = thresholds;
	}

	/**
	 * Start performance monitoring for an operation
	 */
	startOperation(operation: string): PerformanceTracker {
		return new PerformanceTracker(operation, this.thresholds, this.cache);
	}

	/**
	 * Record completed operation metrics
	 */
	recordMetrics(metrics: PerformanceMetrics): void {
		this.metrics.push(metrics);

		// Keep only last 100 metrics to prevent memory leaks
		if (this.metrics.length > 100) {
			this.metrics.shift();
		}

		// Clean up expired cache entries and limit cache size
		const now = Date.now();
		const maxAge = 5 * 60 * 1000; // 5 minutes
		const entries = Array.from(this.cache.entries());

		// Remove expired entries
		for (const [key, value] of entries) {
			if (now - value.timestamp > maxAge) {
				this.cache.delete(key);
			}
		}

		// Also limit cache size to prevent memory leaks
		if (this.cache.size > 1000) {
			const remainingEntries = Array.from(this.cache.entries());
			// Remove oldest 100 entries
			for (let i = 0; i < Math.min(100, remainingEntries.length); i++) {
				const key = remainingEntries[i]?.[0];
				if (key) {
					this.cache.delete(key);
				}
			}
		}
	}

	/**
	 * Get performance report
	 */
	getReport(): PerformanceReport {
		const recentMetrics = this.metrics.slice(-10); // Last 10 operations
		const avgDuration =
			recentMetrics.reduce((sum, m) => sum + m.duration, 0) /
			recentMetrics.length;
		const avgThroughput =
			recentMetrics.reduce((sum, m) => sum + m.throughput, 0) /
			recentMetrics.length;
		const avgMemoryUsage =
			recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) /
			recentMetrics.length;

		const recommendations: string[] = [];
		const warnings: string[] = [];
		const optimizations: string[] = [];

		// Analyze performance and provide recommendations
		if (avgDuration > this.thresholds.maxDuration) {
			warnings.push(
				`Operations are taking longer than expected (${Math.round(avgDuration)}ms average)`,
			);
			recommendations.push(
				'Consider using CSV streaming for large files or disabling analysis',
			);
		}

		if (avgThroughput < this.thresholds.minThroughput) {
			warnings.push(
				`Low throughput detected (${Math.round(avgThroughput)} strings/sec average)`,
			);
			recommendations.push(
				'Disable automatic sorting and deduplication to improve throughput',
			);
		}

		if (avgMemoryUsage > this.thresholds.maxMemoryUsage) {
			warnings.push(
				`High memory usage detected (${Math.round(avgMemoryUsage / (1024 * 1024))} MB average)`,
			);
			recommendations.push(
				'Consider enabling CSV streaming or processing smaller files',
			);
		}

		// Cache optimization recommendations
		const totalCacheHits = recentMetrics.reduce(
			(sum, m) => sum + m.cacheHits,
			0,
		);
		const totalCacheMisses = recentMetrics.reduce(
			(sum, m) => sum + m.cacheMisses,
			0,
		);
		const cacheHitRate = totalCacheHits / (totalCacheHits + totalCacheMisses);

		if (cacheHitRate < 0.5) {
			optimizations.push(
				`Low cache hit rate (${Math.round(cacheHitRate * 100)}%). Consider increasing cache size in settings`,
			);
		}

		const latestMetrics =
			recentMetrics[recentMetrics.length - 1] || this.getDefaultMetrics();

		return {
			metrics: latestMetrics,
			recommendations: Object.freeze(recommendations),
			warnings: Object.freeze(warnings),
			optimizations: Object.freeze(optimizations),
		};
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): {
		readonly size: number;
		readonly hitRate: number;
		readonly totalHits: number;
		readonly totalMisses: number;
	} {
		const totalHits = Array.from(this.cache.values()).reduce(
			(sum, entry) => sum + entry.hits,
			0,
		);
		const totalMisses = this.metrics.reduce((sum, m) => sum + m.cacheMisses, 0);
		const hitRate = totalHits / (totalHits + totalMisses);

		return {
			size: this.cache.size,
			hitRate: Number.isNaN(hitRate) ? 0 : hitRate,
			totalHits,
			totalMisses,
		};
	}

	/**
	 * Clear old cache entries
	 */
	cleanupCache(maxAge: number = 5 * 60 * 1000): void {
		// 5 minutes
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > maxAge) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get default metrics
	 */
	private getDefaultMetrics(): PerformanceMetrics {
		return {
			operation: 'unknown',
			startTime: Date.now(),
			endTime: Date.now(),
			duration: 0,
			stringCount: 0,
			fileSize: 0,
			memoryUsage: 0,
			cpuUsage: 0,
			throughput: 0,
			cacheHits: 0,
			cacheMisses: 0,
		};
	}
}

/**
 * Performance tracker for individual operations
 */
export class PerformanceTracker {
	private readonly operation: string;
	private readonly startTime: number;
	private readonly startMemory: NodeJS.MemoryUsage;
	private readonly startCpu: NodeJS.CpuUsage;
	private readonly cache: Map<
		string,
		{ data: unknown; timestamp: number; hits: number }
	>;
	private cacheHits = 0;
	private cacheMisses = 0;

	constructor(
		operation: string,
		_thresholds: PerformanceThresholds,
		cache: Map<string, { data: unknown; timestamp: number; hits: number }>,
	) {
		this.operation = operation;
		this.startTime = Date.now();
		this.startMemory = process.memoryUsage();
		this.startCpu = process.cpuUsage();
		this.cache = cache;
	}

	/**
	 * Get cached value or compute and cache
	 */
	getCached<T>(
		key: string,
		compute: () => T,
		maxAge: number = 5 * 60 * 1000,
	): T {
		const now = Date.now();
		const cached = this.cache.get(key);

		if (cached && now - cached.timestamp < maxAge) {
			cached.hits++;
			this.cacheHits++;
			return cached.data as T;
		}

		const data = compute();
		this.cache.set(key, { data, timestamp: now, hits: 0 });
		this.cacheMisses++;
		return data;
	}

	/**
	 * End performance tracking
	 */
	end(stringCount: number = 0, fileSize: number = 0): PerformanceMetrics {
		const endTime = Date.now();
		const endMemory = process.memoryUsage();
		const endCpu = process.cpuUsage();

		const duration = endTime - this.startTime;
		const throughput = duration > 0 ? (stringCount / duration) * 1000 : 0;

		const metrics: PerformanceMetrics = {
			operation: this.operation,
			startTime: this.startTime,
			endTime,
			duration,
			stringCount,
			fileSize,
			memoryUsage: endMemory.heapUsed - this.startMemory.heapUsed,
			cpuUsage: endCpu.user - this.startCpu.user,
			throughput,
			cacheHits: this.cacheHits,
			cacheMisses: this.cacheMisses,
		};

		return metrics;
	}
}

/**
 * Get default performance thresholds
 */
export function getDefaultPerformanceThresholds(
	config: StringLeConfig,
): PerformanceThresholds {
	return {
		maxDuration: config.performanceMaxDuration,
		maxMemoryUsage: config.performanceMaxMemoryUsage,
		maxCpuUsage: config.performanceMaxCpuUsage,
		minThroughput: config.performanceMinThroughput,
	};
}

/**
 * Format performance metrics for display
 */
export function formatPerformanceMetrics(metrics: PerformanceMetrics): string {
	const lines: string[] = [];

	lines.push(`**Operation**: ${metrics.operation}`);
	lines.push(`**Duration**: ${metrics.duration}ms`);
	lines.push(`**Strings Extracted**: ${metrics.stringCount}`);
	lines.push(`**File Size**: ${formatFileSize(metrics.fileSize)}`);
	lines.push(`**Throughput**: ${Math.round(metrics.throughput)} strings/sec`);
	lines.push(`**Memory Usage**: ${formatFileSize(metrics.memoryUsage)}`);
	lines.push(`**CPU Usage**: ${Math.round(metrics.cpuUsage / 1000)}ms`);
	lines.push(`**Cache Hits**: ${metrics.cacheHits}`);
	lines.push(`**Cache Misses**: ${metrics.cacheMisses}`);

	return lines.join('\n');
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

	return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Check if performance is within acceptable thresholds
 */
export function isPerformanceAcceptable(
	metrics: PerformanceMetrics,
	thresholds: PerformanceThresholds,
): boolean {
	return (
		metrics.duration <= thresholds.maxDuration &&
		metrics.throughput >= thresholds.minThroughput &&
		metrics.memoryUsage <= thresholds.maxMemoryUsage &&
		metrics.cpuUsage <= thresholds.maxCpuUsage
	);
}

/**
 * Get performance optimization suggestions
 */
export function getPerformanceOptimizations(
	metrics: PerformanceMetrics,
	thresholds: PerformanceThresholds,
): readonly string[] {
	const optimizations: string[] = [];

	if (metrics.duration > thresholds.maxDuration) {
		optimizations.push(
			'Consider enabling CSV streaming or disabling automatic analysis',
		);
	}

	if (metrics.throughput < thresholds.minThroughput) {
		optimizations.push(
			'Disable automatic sorting and deduplication to improve throughput',
		);
	}

	if (metrics.memoryUsage > thresholds.maxMemoryUsage) {
		optimizations.push(
			'Process smaller files or enable CSV streaming to reduce memory usage',
		);
	}

	if (metrics.cacheMisses > metrics.cacheHits * 2) {
		optimizations.push(
			'Improve cache efficiency by increasing cache size in settings',
		);
	}

	return Object.freeze(optimizations);
}

/**
 * Create performance monitor instance
 */
export function createPerformanceMonitor(
	config: StringLeConfig,
): PerformanceMonitor {
	const thresholds = getDefaultPerformanceThresholds(config);
	return new PerformanceMonitor(thresholds);
}
