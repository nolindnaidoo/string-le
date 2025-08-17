// Helpers for filename and extension handling
import * as path from 'node:path'

// Detect effective file type from filename; treat any ".env*" as "env"
export function detectEnvExtension(fileName: string): string {
	const baseName = path.basename(fileName)
	if (baseName === '.env' || baseName.startsWith('.env')) return 'env'
	const raw = path.extname(fileName).slice(1)
	return raw
}
