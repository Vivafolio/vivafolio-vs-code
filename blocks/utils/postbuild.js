import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const distDirName = 'dist'

const resolveBlockDir = () => {
  const [maybeDir] = process.argv.slice(2)
  return path.resolve(process.cwd(), maybeDir ?? '.')
}

const stripDistPrefix = (value, blockDir, distDir) => {
  if (!value) return value

  const distPrefix = new RegExp(`^${distDirName}[\\\\/]`)
  const withoutPrefix = value.replace(distPrefix, '')

  const absolutePath = path.resolve(blockDir, value)
  const relativeToDist = path.relative(distDir, absolutePath)

  // If the path is inside dist/, prefer dist-relative; otherwise fall back to the stripped prefix or original
  if (!relativeToDist.startsWith('..') && !path.isAbsolute(relativeToDist)) {
    return relativeToDist || path.basename(value)
  }

  return withoutPrefix || value
}

async function main() {
  const blockDir = resolveBlockDir()
  const packageJsonPath = path.join(blockDir, 'package.json')
  const distDir = path.join(blockDir, distDirName)
  const distMetadataPath = path.join(distDir, 'block-metadata.json')

  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  const metadata = pkg.blockprotocol

  if (!metadata) {
    throw new Error('package.json is missing a blockprotocol field')
  }

  const blockType =
    typeof metadata.blockType === 'string'
      ? { entryPoint: metadata.blockType }
      : metadata.blockType

  const resources = metadata.resources ?? {}
  const normalizedResources = {
    ...(resources.js
      ? { js: resources.js.map((item) => stripDistPrefix(item, blockDir, distDir)) }
      : {}),
    ...(resources.css
      ? { css: resources.css.map((item) => stripDistPrefix(item, blockDir, distDir)) }
      : {})
  }

  if (!normalizedResources.js || normalizedResources.js.length === 0) {
    normalizedResources.js = ['main.cjs']
  }
  if (!normalizedResources.css || normalizedResources.css.length === 0) {
    normalizedResources.css = ['styles.css']
  }

  const normalizedMetadata = {
    name: metadata.name,
    version: metadata.version,
    description: metadata.description,
    author: metadata.author,
    license: metadata.license,
    externals: metadata.externals ?? {},
    variants: metadata.variants ?? [],
    schema: metadata.schema,
    blockType,
    displayName: metadata.displayName ?? metadata.name,
    icon: metadata.icon,
    image: metadata.image,
    protocol: metadata.protocol,
    repository: metadata.repository,
    commit: metadata.commit,
    devReloadEndpoint: metadata.devReloadEndpoint,
    examples: metadata.examples,
    resources: normalizedResources,
    source: stripDistPrefix(metadata.source ?? normalizedResources.js[0], blockDir, distDir),
    id: metadata.id
  }

  await mkdir(distDir, { recursive: true })
  await writeFile(distMetadataPath, JSON.stringify(normalizedMetadata, null, 2))
  console.log(`Wrote ${path.relative(blockDir, distMetadataPath)}`)
}

main().catch((error) => {
  console.error('Failed to write dist/block-metadata.json', error)
  process.exit(1)
})
