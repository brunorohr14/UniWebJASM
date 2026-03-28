// compression-handler.js - Manages compression detection and selection

const COMP_NONE   = 0;
const COMP_LZMA   = 1;
const COMP_LZ4    = 2;
const COMP_LZ4HC  = 3;
const COMP_LZHAM  = 4;

const CompressionNames = {
    [COMP_NONE]:   'No compression',
    [COMP_LZMA]:   'LZMA',
    [COMP_LZ4]:    'LZ4',
    [COMP_LZ4HC]:  'LZ4HC',
    [COMP_LZHAM]:  'LZHAM'
};

const CompressionDescriptions = {
    [COMP_NONE]:   { name: 'No compression', speed: '⚡ Instant', ratio: '0%', best: 'Already uncompressed' },
    [COMP_LZ4]:    { name: 'LZ4', speed: '⚡⚡ Very Fast', ratio: '~50-60%', best: 'Fast loading, lower compression' },
    [COMP_LZ4HC]:  { name: 'LZ4 HC', speed: '⚡ Fast', ratio: '~45-55%', best: 'Balanced speed/compression' },
    [COMP_LZMA]:   { name: 'LZMA', speed: '🐢 Slow', ratio: '~20-30%', best: 'Maximum compression' },
    [COMP_LZHAM]:  { name: 'LZHAM', speed: '🐢 Slow', ratio: '~25-35%', best: 'High compression' }
};

/**
 * Analyzes compression type and file characteristics
 * Returns recommendations for best decompression method
 */
function analyzeCompressionType(flags) {
    // Ensure flags is a number
    const compType = typeof flags === 'number' ? (flags & 0x3F) : COMP_NONE;
    const info = {
        type: compType,
        name: CompressionNames[compType] || 'Unknown',
        description: CompressionDescriptions[compType] || {},
        isSupported: [COMP_NONE, COMP_LZ4, COMP_LZ4HC, COMP_LZMA].includes(compType),
        recommendedFallback: null
    };

    // If compression type is not supported, suggest fallback
    if (!info.isSupported) {
        if (compType === COMP_LZHAM) {
            info.recommendedFallback = COMP_LZMA;
            info.fallbackNote = 'LZHAM not supported, try LZMA (similar compression)';
        }
    }

    return info;
}

/**
 * Estimates file characteristics for intelligent decompression
 * Looks at magic numbers and header patterns
 */
function estimateCompressionEffectiveness(buffer, uncompressedSize, compressedSize) {
    if (!uncompressedSize || uncompressedSize <= 0) {
        return {
            compressionRatio: 'N/A',
            savings: 'N/A',
            sizeBefore: formatBytes(uncompressedSize || 0),
            sizeAfter: formatBytes(compressedSize || 0),
            efficiency: 'Unknown'
        };
    }
    const ratio = compressedSize / uncompressedSize;
    return {
        compressionRatio: (ratio * 100).toFixed(1) + '%',
        savings: ((1 - ratio) * 100).toFixed(1) + '%',
        sizeBefore: formatBytes(uncompressedSize),
        sizeAfter: formatBytes(compressedSize),
        efficiency: getEfficiencyLevel(ratio)
    };
}

/**
 * Determines efficiency level based on compression ratio
 */
function getEfficiencyLevel(ratio) {
    if (ratio < 0.3) return 'Excellent (< 30%)';
    if (ratio < 0.5) return 'Good (30-50%)';
    if (ratio < 0.7) return 'Fair (50-70%)';
    if (ratio < 0.9) return 'Poor (70-90%)';
    return 'Very Poor (> 90%)';
}

/**
 * Formats bytes to human readable size
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Gets suggested fallback codecs if the primary one fails
 */
function getFallbackSuggestions(compType) {
    const suggestions = {
        [COMP_LZMA]: {
            primary: 'LZ4',
            secondary: 'None',
            reason: 'If LZMA fails, try LZ4 first (requires full LZMA codec). Or try no compression if data is raw.'
        },
        [COMP_LZ4]: {
            primary: 'LZ4HC',
            secondary: 'LZMA',
            reason: 'If LZ4 fails, try LZ4HC (same algo, different tuning). Or try LZMA if HC fails.'
        },
        [COMP_LZ4HC]: {
            primary: 'LZ4',
            secondary: 'None',
            reason: 'If LZ4HC fails, try regular LZ4. Or try no compression if data is uncompressed.'
        },
        [COMP_NONE]: {
            primary: 'LZ4',
            secondary: 'LZMA',
            reason: 'If raw data fails, it might be compressed - try LZ4 or LZMA.'
        }
    };
    
    return suggestions[compType] || { primary: 'LZ4', secondary: 'LZMA', reason: 'Try LZ4 or LZMA' };
}

/**
 * Returns the recommended primary compression method and a fallback.
 * This is used for UI suggestions.
 */
function getBestCompressionMethod(compType, compressedSize = 0) {
    // LZ4 / LZ4HC are already very fast
    if (compType === COMP_LZ4 || compType === COMP_LZ4HC) {
        return {
            primary: compType,
            fallback: COMP_NONE,
            reason: 'LZ4 is already optimal for speed'
        };
    }

    // LZMA for maximum compression
    if (compType === COMP_LZMA) {
        return {
            primary: COMP_LZMA,
            fallback: COMP_NONE,
            reason: 'LZMA provides excellent compression'
        };
    }

    // No compression
    if (compType === COMP_NONE) {
        return {
            primary: COMP_NONE,
            fallback: null,
            reason: 'File is already uncompressed'
        };
    }

    // Unknown compression -> try uncompressed first, then LZMA
    return {
        primary: COMP_NONE,
        fallback: COMP_LZMA,
        reason: 'Unknown compression, will attempt standard decompression'
    };
}

/**
 * Creates a UI panel for compression selection
 */
function createCompressionPanel(compType, stats) {
    const panel = document.createElement('div');
    panel.className = 'compression-panel';
    
    const info = analyzeCompressionType(compType);
    const best = getBestCompressionMethod(compType, stats?.compressedSize || 0);

    // Header
    const header = document.createElement('h3');
    header.textContent = 'Compression Settings';
    panel.appendChild(header);

    // Current compression info
    const current = document.createElement('div');
    current.className = 'compression-current';
    current.innerHTML = `
        <strong>Detected:</strong> ${info.name}<br/>
        <span class="compression-description">${info.description.best || ''}</span>
    `;
    panel.appendChild(current);

    // Statistics (if available)
    if (stats) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'compression-stats';
        statsDiv.innerHTML = `
            <div class="stat-row">
                <span class="stat-label">Original Size:</span>
                <span class="stat-value">${stats.sizeBefore || 'N/A'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Compressed Size:</span>
                <span class="stat-value">${stats.sizeAfter || 'N/A'}</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Compression Ratio:</span>
                <span class="stat-value">${stats.compressionRatio || 'N/A'} (${stats.savings || 'N/A'} saved)</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Efficiency:</span>
                <span class="stat-value">${stats.efficiency || 'N/A'}</span>
            </div>
        `;
        panel.appendChild(statsDiv);
    }

    // Available methods
    const methods = document.createElement('div');
    methods.className = 'compression-methods';
    
    const methodsLabel = document.createElement('strong');
    methodsLabel.textContent = 'Available Decompression Methods:';
    methods.appendChild(methodsLabel);

    const methodsList = document.createElement('div');
    methodsList.className = 'methods-list';

    [COMP_NONE, COMP_LZ4, COMP_LZ4HC, COMP_LZMA].forEach(method => {
        const desc = CompressionDescriptions[method];
        if (!desc) return;

        const methodDiv = document.createElement('div');
        methodDiv.className = 'method-item';
        if (method === compType) methodDiv.classList.add('current');
        if (method === best.primary) methodDiv.classList.add('recommended');

        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'decompression-method';
        radio.value = method;
        radio.checked = (method === compType);
        radio.dataset.compression = method;

        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${desc.name} — ${desc.speed} (${desc.ratio})`));
        
        if (method === best.primary) {
            const badge = document.createElement('span');
            badge.className = 'method-badge recommended';
            badge.textContent = '⭐ Recommended';
            label.appendChild(badge);
        }

        methodDiv.appendChild(label);
        methodsList.appendChild(methodDiv);
    });

    methods.appendChild(methodsList);
    panel.appendChild(methods);

    return panel;
}

export {
    COMP_NONE,
    COMP_LZMA,
    COMP_LZ4,
    COMP_LZ4HC,
    COMP_LZHAM,
    CompressionNames,
    CompressionDescriptions,
    analyzeCompressionType,
    estimateCompressionEffectiveness,
    getBestCompressionMethod,
    getFallbackSuggestions,
    formatBytes,
    createCompressionPanel
};