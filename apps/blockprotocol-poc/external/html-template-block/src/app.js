const NAME_PROPERTY_BASE = "https://blockprotocol.org/@blockprotocol/types/property-type/name/";
const NAME_PROPERTY_VERSIONED = "https://blockprotocol.org/@blockprotocol/types/property-type/name/v/1";

const element = window.blockprotocol.getBlockContainer(import.meta.url);
const blockId = element.dataset.blockId ?? "html-template-block-1";

const title = element.querySelector("[data-title]");
const paragraph = element.querySelector("[data-paragraph]");
const input = element.querySelector("[data-input]");
const readonlyParagraph = element.querySelector("[data-readonly]");

let entity;
let hostApi;

const applyEntity = (nextEntity) => {
  if (!nextEntity) {
    return;
  }
  entity = nextEntity;
  const baseName =
    entity.properties?.[NAME_PROPERTY_BASE] ??
    entity.properties?.[NAME_PROPERTY_VERSIONED] ??
    entity.properties?.name ??
    "Vivafolio Template Block";

  const recordId = entity.metadata?.recordId?.entityId ?? entity.entityId ?? "unknown";
  title.textContent = `Hello, ${baseName}`;
  paragraph.textContent = `The entityId of this block is ${recordId}. Use it to update its data when calling updateEntity`;
  input.value = baseName;
  readonlyParagraph.textContent = baseName;
};

const setReadonly = (readonly) => {
  if (readonly) {
    input.style.display = "none";
    readonlyParagraph.style.display = "block";
  } else {
    input.style.display = "block";
    readonlyParagraph.style.display = "none";
  }
};

const bridge = window.__vivafolioHtmlTemplateHost;
if (bridge && typeof bridge.register === "function") {
  hostApi = bridge.register(blockId, {
    setEntity: applyEntity,
    setReadonly
  });
}

setReadonly(false);

input.addEventListener("change", (event) => {
  if (!entity || !hostApi || typeof hostApi.updateEntity !== "function") {
    return;
  }
  const value = event.target.value;
  hostApi.updateEntity({
    entityId: entity.metadata?.recordId?.entityId ?? entity.entityId,
    properties: {
      [NAME_PROPERTY_BASE]: value,
      [NAME_PROPERTY_VERSIONED]: value
    }
  });
});