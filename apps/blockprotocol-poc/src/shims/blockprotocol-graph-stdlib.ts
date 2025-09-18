/**
 * Temporary shim for `@blockprotocol/graph/stdlib` until the real stdlib is
 * wired into the POC runtime. Each exported function logs a warning and
 * returns `undefined` so bundles requiring the module continue to execute
 * while we implement proper support.
 */

const warned = new Set<string>()

const createStub = <T extends (...args: unknown[]) => unknown>(name: string) => {
  return ((..._args: Parameters<T>) => {
    if (!warned.has(name) && typeof console !== 'undefined') {
      console.warn(
        `[blockprotocol-poc] @blockprotocol/graph/stdlib stub invoked: ${name}. ` +
          'This placeholder returns undefined until the stdlib is implemented.'
      )
      warned.add(name)
    }
    return undefined as ReturnType<T>
  }) as T
}

export const compareBounds = createStub('compareBounds')
export const parseLabelFromEntity = createStub('parseLabelFromEntity')
export const intervalCompareWithInterval = createStub('intervalCompareWithInterval')
export const intervalContainsInterval = createStub('intervalContainsInterval')
export const intervalContainsTimestamp = createStub('intervalContainsTimestamp')
export const intervalForTimestamp = createStub('intervalForTimestamp')
export const intervalIntersectionWithInterval = createStub('intervalIntersectionWithInterval')
export const intervalIsAdjacentToInterval = createStub('intervalIsAdjacentToInterval')
export const intervalIsStrictlyAfterInterval = createStub('intervalIsStrictlyAfterInterval')
export const intervalIsStrictlyBeforeInterval = createStub('intervalIsStrictlyBeforeInterval')
export const intervalMergeWithInterval = createStub('intervalMergeWithInterval')
export const intervalOverlapsInterval = createStub('intervalOverlapsInterval')
export const intervalUnionWithInterval = createStub('intervalUnionWithInterval')
export const sortIntervals = createStub('sortIntervals')
export const buildSubgraph = createStub('buildSubgraph')
export const inferSubgraphEdges = createStub('inferSubgraphEdges')
export const getEntityTypesReferencedByEntityType = createStub('getEntityTypesReferencedByEntityType')
export const getPropertyTypesReferencedByEntityType = createStub('getPropertyTypesReferencedByEntityType')
export const getIncomingLinksForEntity = createStub('getIncomingLinksForEntity')
export const getLeftEntityForLinkEntity = createStub('getLeftEntityForLinkEntity')
export const getOutgoingLinkAndTargetEntities = createStub('getOutgoingLinkAndTargetEntities')
export const getOutgoingLinksForEntity = createStub('getOutgoingLinksForEntity')
export const getRightEntityForLinkEntity = createStub('getRightEntityForLinkEntity')
export const getDataTypesReferencedByPropertyType = createStub('getDataTypesReferencedByPropertyType')
export const getPropertyTypesReferencedByPropertyType = createStub('getPropertyTypesReferencedByPropertyType')
export const getDataTypeById = createStub('getDataTypeById')
export const getDataTypeByVertexId = createStub('getDataTypeByVertexId')
export const getDataTypes = createStub('getDataTypes')
export const getDataTypesByBaseUrl = createStub('getDataTypesByBaseUrl')
export const getEntities = createStub('getEntities')
export const getEntityRevision = createStub('getEntityRevision')
export const getEntityRevisionsByEntityId = createStub('getEntityRevisionsByEntityId')
export const getEntityTypeById = createStub('getEntityTypeById')
export const getEntityTypeByVertexId = createStub('getEntityTypeByVertexId')
export const getEntityTypes = createStub('getEntityTypes')
export const getEntityTypesByBaseUrl = createStub('getEntityTypesByBaseUrl')
export const mapElementsIntoRevisions = createStub('mapElementsIntoRevisions')
export const getPropertyTypeById = createStub('getPropertyTypeById')
export const getPropertyTypeByVertexId = createStub('getPropertyTypeByVertexId')
export const getPropertyTypes = createStub('getPropertyTypes')
export const getPropertyTypesByBaseUrl = createStub('getPropertyTypesByBaseUrl')
export const getRoots = createStub('getRoots')
export const isDataTypeRootedSubgraph = createStub('isDataTypeRootedSubgraph')
export const isEntityRootedSubgraph = createStub('isEntityRootedSubgraph')
export const isEntityTypeRootedSubgraph = createStub('isEntityTypeRootedSubgraph')
export const isPropertyTypeRootedSubgraph = createStub('isPropertyTypeRootedSubgraph')
export const getLatestInstantIntervalForSubgraph = createStub('getLatestInstantIntervalForSubgraph')
export const getVertexIdForRecordId = createStub('getVertexIdForRecordId')
export const unionOfIntervals = createStub('unionOfIntervals')

const stdlib = {
  compareBounds,
  parseLabelFromEntity,
  intervalCompareWithInterval,
  intervalContainsInterval,
  intervalContainsTimestamp,
  intervalForTimestamp,
  intervalIntersectionWithInterval,
  intervalIsAdjacentToInterval,
  intervalIsStrictlyAfterInterval,
  intervalIsStrictlyBeforeInterval,
  intervalMergeWithInterval,
  intervalOverlapsInterval,
  intervalUnionWithInterval,
  sortIntervals,
  buildSubgraph,
  inferSubgraphEdges,
  getEntityTypesReferencedByEntityType,
  getPropertyTypesReferencedByEntityType,
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  getDataTypesReferencedByPropertyType,
  getPropertyTypesReferencedByPropertyType,
  getDataTypeById,
  getDataTypeByVertexId,
  getDataTypes,
  getDataTypesByBaseUrl,
  getEntities,
  getEntityRevision,
  getEntityRevisionsByEntityId,
  getEntityTypeById,
  getEntityTypeByVertexId,
  getEntityTypes,
  getEntityTypesByBaseUrl,
  mapElementsIntoRevisions,
  getPropertyTypeById,
  getPropertyTypeByVertexId,
  getPropertyTypes,
  getPropertyTypesByBaseUrl,
  getRoots,
  isDataTypeRootedSubgraph,
  isEntityRootedSubgraph,
  isEntityTypeRootedSubgraph,
  isPropertyTypeRootedSubgraph,
  getLatestInstantIntervalForSubgraph,
  getVertexIdForRecordId,
  unionOfIntervals
}

export default stdlib
