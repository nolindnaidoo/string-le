# String‑LE Performance Guide

This document provides comprehensive performance metrics, optimization guidelines, and benchmarking data for String‑LE's extraction capabilities across all supported file formats.

## Performance at a Glance

| Format | Performance Tier | Throughput Range | Best Use Cases |
|--------|------------------|------------------|----------------|
| **ENV** | ⚡ Excellent | 4M+ lines/sec | Environment variables, simple configs |
| **JSON** | ⚡ Excellent | 1.8M+ lines/sec | APIs, large datasets, structured data |
| **INI** | 🔥 Very Good | 1.3M+ lines/sec | Configuration files, legacy systems |
| **TOML** | 🔥 Very Good | 530K+ lines/sec | Modern configuration, structured configs |
| **CSV** | 🔥 Very Good | 440K+ lines/sec | Tabular data, data export/import |
| **YAML** | 🟡 Good | 190K+ lines/sec | Human-readable configs, documentation |

## Benchmark Environment

All performance metrics collected using:
- **Node.js**: v22.18.0
- **Platform**: macOS (Apple Silicon)
- **Test Date**: August 2025
- **Extension Version**: 1.0.0+

## Detailed Performance Metrics

### Large File Performance (500k+ lines)

#### JSON Format
```
File Size:     65MB (501,500 lines)
Extraction:    275ms
Throughput:    1.8M lines/second
Strings:       2.5M extracted
Memory Usage:  117MB peak
```

**Analysis**: JSON demonstrates exceptional performance for large structured datasets. The parser efficiently handles nested objects and arrays with predictable memory scaling. Ideal for API responses, configuration files, and data processing workflows.

#### CSV Format  
```
File Size:     30MB (501,021 lines)
Extraction:    1,149ms
Throughput:    440K lines/second  
Strings:       3M extracted
Memory Usage:  275MB peak
```

**Analysis**: CSV shows solid performance with linear scaling characteristics. Memory usage reflects multi-column processing overhead. Streaming mode available for very large files (>100k lines) to reduce memory pressure.

### Medium File Performance (5k lines)

#### ENV Format (Environment Variables)
```
File Size:     0.15MB (5,001 lines)
Extraction:    1.2ms
Throughput:    4.2M lines/second
Strings:       5,000 extracted  
Memory Usage:  <1MB
```

**Analysis**: ENV format is optimized for typical configuration scenarios with exceptional speed and minimal memory footprint. Perfect for environment variable extraction and simple key-value configurations.

#### INI Format
```
File Size:     0.06MB (5,000 lines)
Extraction:    3.7ms
Throughput:    1.3M lines/second
Strings:       3,125 extracted
Memory Usage:  4.6MB
```

**Analysis**: INI format provides excellent performance for sectioned configuration files. Good scaling characteristics make it suitable for both small and medium-sized configuration files.

#### TOML Format  
```
File Size:     0.07MB (5,000 lines)
Extraction:    9.4ms
Throughput:    532K lines/second
Strings:       1,875 extracted
Memory Usage:  <1MB
```

**Analysis**: TOML performance has been significantly optimized using the high-performance `@iarna/toml` parser. Excellent for modern configuration files with rich data types and complex structures.

#### YAML Format
```
File Size:     0.48MB (5,001 lines)  
Extraction:    26ms
Throughput:    193K lines/second
Strings:       15,000 extracted
Memory Usage:  2.9MB
```

**Analysis**: YAML offers good performance for human-readable configuration files. Performance scales well with moderate nesting but may degrade with deeply nested structures.

## Performance Tiers Explained

### ⚡ Excellent (1M+ lines/sec)
Formats that process at exceptional speed with minimal overhead:
- **ENV**: Optimized for simple key-value parsing
- **JSON**: High-performance parser with efficient memory management

### 🔥 Very Good (400K-1.3M lines/sec)  
Formats with strong performance suitable for most use cases:
- **INI**: Well-optimized sectioned configuration parsing
- **TOML**: Modern parser with excellent efficiency
- **CSV**: Solid tabular data processing with streaming support

### 🟡 Good (100K-400K lines/sec)
Formats with acceptable performance, best for moderate file sizes:
- **YAML**: Good for human-maintained files, watch nesting depth

## File Size Recommendations

### Small Files (< 1,000 lines)
All formats perform excellently. Choose based on data structure needs:
- **ENV**: Simple key-value pairs
- **JSON**: Structured/nested data  
- **YAML**: Human-readable configuration
- **INI**: Traditional sectioned configuration
- **TOML**: Rich, typed configuration
- **CSV**: Tabular data

### Medium Files (1K - 50K lines)
All formats maintain good performance:
- **Recommended**: All formats suitable
- **Performance**: Consistent across all types
- **Memory**: Linear scaling, no concerns

### Large Files (50K+ lines)
Consider format characteristics:
- **Highly Recommended**: JSON, CSV (with streaming)
- **Good Performance**: ENV, INI, TOML
- **Monitor**: YAML performance with deep nesting

### Very Large Files (500K+ lines)
Optimize for specific needs:
- **Best Choice**: JSON for structured data
- **Tabular Data**: CSV with streaming enabled
- **Simple Configs**: ENV still performs excellently
- **Consider**: File splitting for very complex YAML

## Memory Usage Patterns

### Memory Efficiency Ranking
1. **ENV** (0.83MB/5k lines) - Most efficient
2. **TOML** (<1MB/5k lines) - Excellent efficiency  
3. **YAML** (2.9MB/5k lines) - Good efficiency
4. **INI** (4.6MB/5k lines) - Moderate usage
5. **JSON** (117MB/500k lines) - Scales well for size
6. **CSV** (275MB/500k lines) - Higher for multi-column data

### Scaling Characteristics
- **Linear Scaling**: ENV, INI, YAML, TOML
- **Efficient Large-File**: JSON (good memory management)
- **Column-Dependent**: CSV (varies with column count)

## Optimization Guidelines

### General Performance Tips
- Enable CSV streaming for files >100k lines
- Monitor memory with multiple large files open
- Use appropriate format for data structure complexity
- Consider file splitting for very large YAML files

### Format-Specific Optimizations

#### JSON
- Consistently excellent across all file sizes
- Memory usage scales predictably with content
- Best choice for automated processing workflows

#### CSV  
- Enable streaming: `"string-le.csv.streamingEnabled": true`
- Memory scales with column count, not just file size
- Use column selection for memory optimization
- Streaming works with header detection and column selection

#### TOML
- Excellent performance for all configuration use cases
- No special optimization needed
- Good choice for rich, structured configuration

#### YAML
- Performance optimal with flat or moderately nested structures  
- Avoid deeply nested objects when possible
- Good for human-maintained configuration files

#### ENV
- Peak performance for simple key-value scenarios
- No optimization needed - already optimal
- Perfect for environment variable extraction

#### INI
- Excellent for sectioned configuration files
- Linear performance scaling
- Good choice for legacy configuration formats

## Performance Testing

### Running Benchmarks
```bash
# Run performance benchmarks
npm run test:performance

# Generate detailed performance report  
npm run performance:report
```

### Test Files
The performance suite uses realistic test data:
- `500k.csv` - 501k lines, 30MB tabular data
- `500k.json` - 501k lines, 65MB structured data
- `5k.env` - 5k lines, environment variables
- `5k.ini` - 5k lines, sectioned configuration  
- `5k.toml` - 5k lines, structured configuration
- `5k.yaml` - 5k lines, hierarchical configuration

### Interpreting Results
- **Throughput**: Lines processed per second
- **Memory Usage**: Peak memory consumption during extraction
- **Extraction Count**: Number of strings successfully extracted
- **File Size**: Input file size in MB

## Real-World Performance Scenarios

### Localization Workflows
- **Small Projects** (< 1k strings): All formats excellent
- **Medium Projects** (1k-10k strings): JSON/YAML recommended  
- **Large Projects** (10k+ strings): JSON strongly preferred

### Configuration Management
- **Environment Variables**: ENV format optimal
- **Application Config**: TOML excellent choice
- **Build/Deploy Config**: YAML good for readability
- **Legacy Systems**: INI maintains compatibility

### Data Processing
- **API Responses**: JSON best performance
- **Data Export**: CSV with streaming for large files
- **Structured Logs**: JSON recommended
- **Report Generation**: CSV for tabular output

## Performance Monitoring

### Built-in Metrics
String‑LE automatically tracks:
- Extraction time per operation
- Memory usage during processing  
- File size warnings for large inputs
- Throughput measurements

### Configuration for Performance
```json
{
  "string-le.safety.enabled": true,
  "string-le.safety.fileSizeWarnBytes": 1000000,
  "string-le.safety.largeOutputLinesThreshold": 50000,
  "string-le.csv.streamingEnabled": true
}
```

### Performance Alerts
- File size warnings before processing large files
- Large output confirmation before opening
- Memory pressure notifications (if available)

## Troubleshooting Performance Issues

### Common Performance Problems

#### Slow YAML Processing
```
Symptoms: YAML files taking longer than expected
Causes: Deeply nested structures, complex anchors/references
Solutions: Flatten structure, split large files, consider JSON
```

#### High Memory Usage with CSV
```
Symptoms: Memory alerts during CSV processing
Causes: Many columns, large file size, streaming disabled
Solutions: Enable streaming, select specific columns
```

#### Large Output Delays
```
Symptoms: Long delays opening extraction results
Causes: >50k extracted strings, editor rendering overhead  
Solutions: Use "Copy to Clipboard" option, adjust threshold
```

### Performance Diagnostics
1. Check file size against format recommendations
2. Verify streaming settings for CSV files
3. Monitor memory usage during extraction
4. Review extraction count vs. file complexity

## Historical Performance Data

### Version 1.0.0 Optimizations
- **Parser Upgrade**: Switched to `@iarna/toml` for better performance
- **Memory Efficiency**: Reduced TOML memory usage by 99%

## Contributing Performance Improvements

### Performance Testing Guidelines
1. Run benchmarks before and after changes
2. Test across all supported formats
3. Verify no regression in other formats  
4. Update this documentation with new metrics

### Submitting Performance Data
When reporting performance issues or improvements:
- Include system specifications (OS, Node.js version, hardware)
- Provide sample file characteristics (size, structure, format)
- Include benchmark results with `npm run test:performance`
- Describe specific use case and expected vs. actual performance

For performance-related issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or open an issue with the `performance` label.

---
**Project:** [Issues](https://github.com/nolindnaidoo/string-le/issues) • [Pull Requests](https://github.com/nolindnaidoo/string-le/pulls) • [Releases](https://github.com/nolindnaidoo/string-le/releases) • [MIT License](LICENSE)

**Dev:** [Spec](SPECIFICATION.md) • [Architecture](ARCHITECTURE.md) • [Development](DEVELOPMENT.md)  • [Troubleshooting](TROUBLESHOOTING.md)

**Docs:** [Commands](COMMANDS.md) • [Notifications](NOTIFICATIONS.md) • [Status Bar](STATUSBAR.md) • [Config](CONFIGURATION.md) • [Performance](PERFORMANCE.md) • [I18N](I18N.md) • [Privacy](PRIVACY.md)
