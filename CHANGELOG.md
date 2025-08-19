# Changelog

All notable changes to String-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-08-17
### ✨ Added

- **Trim Whitespace**: New option to automatically trim leading, trailing, or both ends of extracted strings. Configure your preferred trim mode in settings for cleaner results.


## [1.0.0] - 2025-08-17

### ✨ Initial Release

**String-LE** - Extract every user-visible string from structured files with a single command.

#### **Core Functionality**

- **Multi-format support**: JSON, YAML, CSV, TOML, INI, and .env files
- **One-command extraction**: `Ctrl+Alt+E` (`Cmd+Alt+E` on macOS) or Command
- **Multiple access methods**: Context menu, status bar, Quick Fix (Code Actions)

#### **Advanced Features**

- **CSV streaming**: Handle massive files without memory issues
- **Column selection**: Extract from specific columns or all at once
- **Smart processing**: Automatic deduplication and configurable sorting
- **Safety guardrails**: Warnings for large files and outputs

#### **Enterprise Ready**

- **13 languages supported**: Full internationalization from day one
- **Virtual workspace support**: Compatible with GitHub Codespaces, Gitpod
- **Untrusted workspace handling**: Safe operation in restricted environments
- **Performance optimized**: Processes 1MB+ files with progress indicators

#### **Developer Experience**

- **Comprehensive configuration**: 14+ settings for customization
- **Local-only telemetry**: Privacy-focused with configurable logging
- **Accessibility compliant**: Full keyboard navigation and screen reader support
- **Error handling**: Graceful fallbacks with detailed feedback
