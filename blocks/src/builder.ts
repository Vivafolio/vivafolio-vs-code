import * as fs from 'fs/promises';
import * as path from 'path';
import { watch, type FSWatcher } from 'fs';

/**
 * Block Builder & Server
 *
 * Provides framework compilation and serving capabilities for Block Protocol blocks.
 * Supports hot reloading and multiple frameworks (SolidJS, Vue, Svelte, Lit, Angular).
 */

export interface FrameworkBundle {
  id: string;
  hash: string;
  assets: string[];
  metadata: Record<string, unknown>;
  entryPoint: string;
  lastModified: Date;
}

export interface FrameworkWatcher {
  framework: string;
  sourceDir: string;
  outputDir: string;
  watcher?: FSWatcher;
  bundles: Map<string, FrameworkBundle>;
}

export interface BlockBuilderOptions {
  frameworks?: string[];
  outputDir?: string;
  watchMode?: boolean;
  onBundleUpdate?: (framework: string, bundle: FrameworkBundle) => void;
}

/**
 * Block Builder - Handles compilation and watching of framework blocks
 */
export class BlockBuilder {
  private watchers: FrameworkWatcher[] = [];
  private options: BlockBuilderOptions;

  constructor(options: BlockBuilderOptions = {}) {
    this.options = {
      frameworks: ['solidjs', 'vue', 'svelte', 'lit', 'angular'],
      outputDir: path.join(process.cwd(), 'dist', 'blocks'),
      watchMode: false,
      ...options
    };
  }

  /**
   * Generate content-based hash for cache busting
   */
  private generateAssetHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  }

  /**
   * Compile SolidJS block
   */
  private async compileSolidJSBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const hash = this.generateAssetHash(sourceContent);

    // Create a simple CommonJS wrapper for SolidJS
    const compiledContent = `
(function() {
  const React = {
    createElement: function(tag, props, ...children) {
      if (typeof tag === 'function') {
        return tag(props || {}, children);
      }
      const el = document.createElement(tag);
      if (props) {
        Object.keys(props).forEach(key => {
          if (key === 'className') {
            el.className = props[key];
          } else if (key === 'style') {
            Object.assign(el.style, props[key]);
          } else if (key.startsWith('on') && typeof props[key] === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), props[key]);
          } else {
            el.setAttribute(key, props[key]);
          }
        });
      }
      children.forEach(child => {
        if (typeof child === 'string') {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
      return el;
    }
  };

  ${sourceContent}

  if (typeof module !== 'undefined' && module.exports) {
    return module.exports;
  }
  return StatusPillBlock;
})();
`;

    const outputFile = path.join(outputPath, `solidjs-${hash}.js`);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(outputFile, compiledContent, 'utf8');

    return {
      id: `solidjs-${path.basename(sourcePath, path.extname(sourcePath))}`,
      hash,
      assets: [`solidjs-${hash}.js`],
      metadata: {
        framework: 'solidjs',
        sourcePath,
        compiledAt: new Date().toISOString()
      },
      entryPoint: `solidjs-${hash}.js`,
      lastModified: new Date()
    };
  }

  /**
   * Compile Vue block
   */
  private async compileVueBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const hash = this.generateAssetHash(sourceContent);

    const compiledContent = `
(function() {
  const Vue = {
    createApp: function(component) {
      return {
        mount: function(el) {
          console.log('Vue block mounted:', component);
          el.innerHTML = '<div class="vue-block">Vue Block Component</div>';
        }
      };
    }
  };

  ${sourceContent}

  return { default: VueBlock };
})();
`;

    const outputFile = path.join(outputPath, `vue-${hash}.js`);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(outputFile, compiledContent, 'utf8');

    return {
      id: `vue-${path.basename(sourcePath, path.extname(sourcePath))}`,
      hash,
      assets: [`vue-${hash}.js`],
      metadata: {
        framework: 'vue',
        sourcePath,
        compiledAt: new Date().toISOString()
      },
      entryPoint: `vue-${hash}.js`,
      lastModified: new Date()
    };
  }

  /**
   * Compile Svelte block
   */
  private async compileSvelteBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const hash = this.generateAssetHash(sourceContent);

    const compiledContent = `
(function() {
  ${sourceContent}

  return { default: SvelteBlock };
})();
`;

    const outputFile = path.join(outputPath, `svelte-${hash}.js`);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(outputFile, compiledContent, 'utf8');

    return {
      id: `svelte-${path.basename(sourcePath, path.extname(sourcePath))}`,
      hash,
      assets: [`svelte-${hash}.js`],
      metadata: {
        framework: 'svelte',
        sourcePath,
        compiledAt: new Date().toISOString()
      },
      entryPoint: `svelte-${hash}.js`,
      lastModified: new Date()
    };
  }

  /**
   * Compile Lit block
   */
  private async compileLitBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const hash = this.generateAssetHash(sourceContent);

    const compiledContent = `
(function() {
  ${sourceContent}

  return { LitBlock };
})();
`;

    const outputFile = path.join(outputPath, `lit-${hash}.js`);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(outputFile, compiledContent, 'utf8');

    return {
      id: `lit-${path.basename(sourcePath, path.extname(sourcePath))}`,
      hash,
      assets: [`lit-${hash}.js`],
      metadata: {
        framework: 'lit',
        sourcePath,
        compiledAt: new Date().toISOString()
      },
      entryPoint: `lit-${hash}.js`,
      lastModified: new Date()
    };
  }

  /**
   * Compile Angular block
   */
  private async compileAngularBlock(sourcePath: string, outputPath: string): Promise<FrameworkBundle> {
    const sourceContent = await fs.readFile(sourcePath, 'utf8');
    const hash = this.generateAssetHash(sourceContent);

    const compiledContent = `
(function() {
  ${sourceContent}

  return { AngularBlock };
})();
`;

    const outputFile = path.join(outputPath, `angular-${hash}.js`);
    await fs.mkdir(outputPath, { recursive: true });
    await fs.writeFile(outputFile, compiledContent, 'utf8');

    return {
      id: `angular-${path.basename(sourcePath, path.extname(sourcePath))}`,
      hash,
      assets: [`angular-${hash}.js`],
      metadata: {
        framework: 'angular',
        sourcePath,
        compiledAt: new Date().toISOString()
      },
      entryPoint: `angular-${hash}.js`,
      lastModified: new Date()
    };
  }

  /**
   * Get framework compiler function
   */
  private getFrameworkCompiler(framework: string) {
    switch (framework) {
      case 'solidjs': return this.compileSolidJSBlock.bind(this);
      case 'vue': return this.compileVueBlock.bind(this);
      case 'svelte': return this.compileSvelteBlock.bind(this);
      case 'lit': return this.compileLitBlock.bind(this);
      case 'angular': return this.compileAngularBlock.bind(this);
      default: throw new Error(`Unsupported framework: ${framework}`);
    }
  }

  /**
   * Detect framework from file extension
   */
  private detectFramework(filePath: string): string | null {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.tsx':
      case '.ts':
      case '.js':
        // For TypeScript/JavaScript, try to detect from content or assume SolidJS for now
        return 'solidjs';
      case '.vue':
        return 'vue';
      case '.svelte':
        return 'svelte';
      default:
        return null;
    }
  }

  /**
   * Build all blocks for specified frameworks
   */
  async build(): Promise<FrameworkWatcher[]> {
    const watchers: FrameworkWatcher[] = [];

    for (const framework of this.options.frameworks!) {
      const sourceDir = path.join(process.cwd(), 'packages', 'block-frameworks', framework, 'examples');
      const frameworkOutputDir = path.join(this.options.outputDir!, framework);

      // Check if framework examples exist
      try {
        await fs.access(sourceDir);
      } catch {
        console.log(`[block-builder] Skipping ${framework} - examples directory not found`);
        continue;
      }

      const watcher: FrameworkWatcher = {
        framework,
        sourceDir,
        outputDir: frameworkOutputDir,
        bundles: new Map()
      };

      // Initial compilation
      try {
        const files = await fs.readdir(sourceDir);
        const compiler = this.getFrameworkCompiler(framework);

        for (const file of files) {
          if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js') ||
              file.endsWith('.vue') || file.endsWith('.svelte')) {
            const sourcePath = path.join(sourceDir, file);
            const bundle = await compiler(sourcePath, frameworkOutputDir);
            watcher.bundles.set(bundle.id, bundle);
            console.log(`[block-builder] Compiled ${framework}/${file} -> ${bundle.entryPoint}`);
          }
        }
      } catch (error) {
        console.error(`[block-builder] Failed to compile ${framework} blocks:`, error);
      }

      watchers.push(watcher);
    }

    this.watchers = watchers;
    return watchers;
  }

  /**
   * Start watching for changes
   */
  async watch(): Promise<void> {
    if (!this.options.watchMode) return;

    for (const watcher of this.watchers) {
      watcher.watcher = watch(watcher.sourceDir, { recursive: true }, async (event, filename) => {
        if (!filename || !filename.match(/\.(tsx|ts|js|vue|svelte)$/)) return;

        try {
          const sourcePath = path.join(watcher.sourceDir, filename);
          const compiler = this.getFrameworkCompiler(watcher.framework);
          const bundle = await compiler(sourcePath, watcher.outputDir);

          watcher.bundles.set(bundle.id, bundle);
          console.log(`[block-builder] Recompiled ${watcher.framework}/${filename} -> ${bundle.entryPoint}`);

          // Notify about bundle update
          if (this.options.onBundleUpdate) {
            this.options.onBundleUpdate(watcher.framework, bundle);
          }
        } catch (error) {
          console.error(`[block-builder] Failed to recompile ${watcher.framework}/${filename}:`, error);
        }
      });

      console.log(`[block-builder] Watching ${watcher.framework} blocks in ${watcher.sourceDir}`);
    }
  }

  /**
   * Stop watching and cleanup
   */
  async stop(): Promise<void> {
    for (const watcher of this.watchers) {
      if (watcher.watcher) {
        watcher.watcher.close();
      }
    }
    this.watchers = [];
  }

  /**
   * Get all current bundles
   */
  getBundles(): Map<string, FrameworkBundle> {
    const allBundles = new Map<string, FrameworkBundle>();
    for (const watcher of this.watchers) {
      for (const [id, bundle] of watcher.bundles) {
        allBundles.set(id, bundle);
      }
    }
    return allBundles;
  }

  /**
   * Get watcher for specific framework
   */
  getWatcher(framework: string): FrameworkWatcher | undefined {
    return this.watchers.find(w => w.framework === framework);
  }
}
