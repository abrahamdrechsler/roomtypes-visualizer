const searchInput = document.getElementById("searchInput");
const fileInput = document.getElementById("jsonFileInput");
const resultCount = document.getElementById("resultCount");
const roomList = document.getElementById("roomList");
const roomCardTemplate = document.getElementById("roomCardTemplate");
const filterBuilderEl = document.getElementById("filterBuilder");
const resetFilterBuilderBtn = document.getElementById("resetFilterBuilderBtn");
const attributeModeToggleBtn = document.getElementById("attributeModeToggleBtn");

const PINNED_STORAGE_KEY = "room_types_visualizer_pinned_rooms";
const ATTRIBUTE_MODE_STORAGE_KEY = "room_types_visualizer_attribute_mode";
const DEFAULT_INSPECTOR_VISIBLE_KEYS = ["roomType", "name", "shortName", "roomClass", "roomEnclosure"];

let allRooms = [];
let pinnedRoomTypes = new Set();
let fieldRegistry = [];
let filterTree = makeDefaultFilterTree();
let idCounter = 0;
let inspectorVisibleAttributeKeys = new Set(DEFAULT_INSPECTOR_VISIBLE_KEYS);
let attributeVisibilityMode = "all";

function nextId(prefix = "id") {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function makeDefaultFilterTree() {
  return { id: "root_group", type: "group", mode: "and", children: [] };
}

function createRule(fieldKey) {
  const field = fieldRegistry.find((item) => item.key === fieldKey) || fieldRegistry[0];
  const defaultOp = defaultOperatorForType(field?.type || "text");
  return {
    id: nextId("rule"),
    type: "rule",
    fieldKey: field?.key || "",
    operator: defaultOp,
    value: "",
  };
}

function createGroup() {
  return {
    id: nextId("group"),
    type: "group",
    mode: "and",
    children: [],
  };
}

function roomDisplayName(room) {
  return room.base_attributes?.name || room.room_type;
}

function formatValue(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function roomSearchText(room) {
  const attributeValues = Object.values(room.base_attributes || {}).join(" ");
  return `${room.room_type} ${room.base_attributes?.name || ""} ${room.base_attributes?.shortName || ""} ${attributeValues}`.toLowerCase();
}

function inferPrimitiveType(values) {
  const nonNullValues = values.filter((value) => value !== undefined && value !== null);
  if (!nonNullValues.length) return "text";
  if (nonNullValues.every((value) => typeof value === "boolean")) return "boolean";
  if (nonNullValues.every((value) => typeof value === "number")) return "number";
  if (nonNullValues.every((value) => typeof value === "string")) return "text";
  return "text";
}

function buildFieldRegistry(rooms) {
  const fields = [];
  const fieldMap = new Map();

  function addField(field) {
    if (!fieldMap.has(field.key)) {
      fieldMap.set(field.key, field);
      fields.push(field);
    }
  }

  addField({
    key: "room_type",
    label: "Room Type Key",
    type: "text",
    getter: (room) => room.room_type,
  });
  addField({
    key: "name",
    label: "Name",
    type: "text",
    getter: (room) => room.base_attributes?.name || "",
  });
  addField({
    key: "shortName",
    label: "Short Name",
    type: "text",
    getter: (room) => room.base_attributes?.shortName || "",
  });
  addField({
    key: "behavior_tags",
    label: "Behavior Tags",
    type: "list_text",
    getter: (room) => room.behavior_tags || [],
  });

  const attributeKeys = new Set();
  for (const room of rooms) {
    Object.keys(room.base_attributes || {}).forEach((key) => attributeKeys.add(key));
  }

  for (const attrKey of [...attributeKeys].sort((a, b) => a.localeCompare(b))) {
    const values = rooms.map((room) => room.base_attributes?.[attrKey]);
    const type = inferPrimitiveType(values);
    addField({
      key: `base_attributes.${attrKey}`,
      label: `Attribute: ${attrKey}`,
      type,
      getter: (room) => room.base_attributes?.[attrKey],
    });
  }

  return fields;
}

function defaultOperatorForType(type) {
  if (type === "number") return "equals";
  if (type === "boolean") return "is_true";
  if (type === "list_text") return "contains";
  return "contains";
}

function operatorsForType(type) {
  if (type === "number") {
    return [
      ["equals", "is"],
      ["not_equals", "is not"],
      ["gt", "greater than"],
      ["gte", "greater than or equal"],
      ["lt", "less than"],
      ["lte", "less than or equal"],
      ["is_empty", "is empty"],
      ["is_not_empty", "is not empty"],
    ];
  }
  if (type === "boolean") {
    return [
      ["is_true", "is checked"],
      ["is_false", "is not checked"],
    ];
  }
  if (type === "list_text") {
    return [
      ["contains", "contains"],
      ["not_contains", "does not contain"],
      ["is_empty", "is empty"],
      ["is_not_empty", "is not empty"],
    ];
  }
  return [
    ["contains", "contains"],
    ["not_contains", "does not contain"],
    ["equals", "is"],
    ["not_equals", "is not"],
    ["starts_with", "starts with"],
    ["ends_with", "ends with"],
    ["is_empty", "is empty"],
    ["is_not_empty", "is not empty"],
  ];
}

function operatorNeedsValue(operator) {
  return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(operator);
}

function loadPinnedState() {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      pinnedRoomTypes = new Set(parsed.filter((value) => typeof value === "string"));
    }
  } catch {
    pinnedRoomTypes = new Set();
  }
}

function persistPinnedState() {
  localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...pinnedRoomTypes]));
}

function loadAttributeModeState() {
  const raw = localStorage.getItem(ATTRIBUTE_MODE_STORAGE_KEY);
  attributeVisibilityMode = raw === "inspector" ? "inspector" : "all";
  updateAttributeToggleButtonLabel();
}

function persistAttributeModeState() {
  localStorage.setItem(ATTRIBUTE_MODE_STORAGE_KEY, attributeVisibilityMode);
}

function updateAttributeToggleButtonLabel() {
  attributeModeToggleBtn.textContent =
    attributeVisibilityMode === "inspector"
      ? "Show all parameters"
      : "Show inspector only parameters";
}

function isPublicVisibilityValue(rawValue) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "publicly_visible" || normalized === "publically_visible") return true;
  if (normalized === "visible") return true;
  if (normalized.startsWith("not_")) return false;
  if (normalized.startsWith("not ")) return false;
  return normalized.includes("public") && !normalized.includes("not");
}

function buildInspectorVisibleKeys(jsonObject) {
  const keys = new Set(DEFAULT_INSPECTOR_VISIBLE_KEYS);

  const parameterVisibility = jsonObject?.parameter_visibility;
  if (parameterVisibility && typeof parameterVisibility === "object") {
    for (const [key, visibility] of Object.entries(parameterVisibility)) {
      if (isPublicVisibilityValue(visibility)) {
        keys.add(key);
      }
    }
    return keys;
  }

  const shared = Array.isArray(jsonObject?.shared_attributes) ? jsonObject.shared_attributes : [];
  for (const key of shared) {
    if (typeof key === "string" && key.trim()) {
      keys.add(key);
    }
  }
  return keys;
}

function normalizeData(json) {
  if (!json || typeof json !== "object" || !json.room_types || typeof json.room_types !== "object") {
    throw new Error("Invalid JSON format: expected a top-level room_types object.");
  }

  return Object.entries(json.room_types)
    .map(([key, room]) => ({
      room_type: room.room_type || key,
      base_attributes: room.base_attributes || {},
      behavior_tags: room.behavior_tags || [],
      unique_behaviors: room.unique_behaviors || [],
    }))
    .sort((a, b) => roomDisplayName(a).localeCompare(roomDisplayName(b)))
    .map((room) => ({ ...room, _searchText: roomSearchText(room) }));
}

function sortedRoomsForRender(rooms) {
  return [...rooms].sort((a, b) => {
    const aPinned = pinnedRoomTypes.has(a.room_type);
    const bPinned = pinnedRoomTypes.has(b.room_type);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return roomDisplayName(a).localeCompare(roomDisplayName(b));
  });
}

function evaluateRule(rule, room) {
  const field = fieldRegistry.find((entry) => entry.key === rule.fieldKey);
  if (!field) return true;
  const value = field.getter(room);
  const op = rule.operator;

  if (field.type === "boolean") {
    if (op === "is_true") return value === true;
    if (op === "is_false") return value === false;
    return true;
  }

  if (field.type === "number") {
    if (op === "is_empty") return value === undefined || value === null || value === "";
    if (op === "is_not_empty") return !(value === undefined || value === null || value === "");
    const left = Number(value);
    const right = Number(rule.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === "equals") return left === right;
    if (op === "not_equals") return left !== right;
    if (op === "gt") return left > right;
    if (op === "gte") return left >= right;
    if (op === "lt") return left < right;
    if (op === "lte") return left <= right;
    return true;
  }

  if (field.type === "list_text") {
    const values = Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : [];
    const query = String(rule.value || "").toLowerCase();
    if (op === "is_empty") return values.length === 0;
    if (op === "is_not_empty") return values.length > 0;
    if (op === "contains") return values.some((item) => item.includes(query));
    if (op === "not_contains") return values.every((item) => !item.includes(query));
    return true;
  }

  const left = String(value ?? "").toLowerCase();
  const right = String(rule.value ?? "").toLowerCase();
  if (op === "is_empty") return left.trim() === "";
  if (op === "is_not_empty") return left.trim() !== "";
  if (op === "contains") return left.includes(right);
  if (op === "not_contains") return !left.includes(right);
  if (op === "equals") return left === right;
  if (op === "not_equals") return left !== right;
  if (op === "starts_with") return left.startsWith(right);
  if (op === "ends_with") return left.endsWith(right);
  return true;
}

function evaluateFilterNode(node, room) {
  if (!node) return true;
  if (node.type === "rule") return evaluateRule(node, room);
  if (!node.children || node.children.length === 0) return true;
  if (node.mode === "or") {
    return node.children.some((child) => evaluateFilterNode(child, room));
  }
  return node.children.every((child) => evaluateFilterNode(child, room));
}

function renderFilterGroup(group, depth = 0, isRoot = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "filter-group-block";
  wrapper.style.marginLeft = `${depth * 14}px`;
  wrapper.dataset.groupId = group.id;

  const header = document.createElement("div");
  header.className = "filter-group-header";

  const modeLabel = document.createElement("span");
  modeLabel.className = "filter-group-label";
  modeLabel.textContent = "Match";

  const modeSelect = document.createElement("select");
  modeSelect.className = "filter-mode-select";
  modeSelect.dataset.action = "set-group-mode";
  modeSelect.dataset.groupId = group.id;
  modeSelect.innerHTML = `
    <option value="and">all rules (AND)</option>
    <option value="or">any rule (OR)</option>
  `;
  modeSelect.value = group.mode;

  const addRuleBtn = document.createElement("button");
  addRuleBtn.type = "button";
  addRuleBtn.className = "mini-btn";
  addRuleBtn.dataset.action = "add-rule";
  addRuleBtn.dataset.groupId = group.id;
  addRuleBtn.textContent = "+ Filter";

  const addGroupBtn = document.createElement("button");
  addGroupBtn.type = "button";
  addGroupBtn.className = "mini-btn";
  addGroupBtn.dataset.action = "add-group";
  addGroupBtn.dataset.groupId = group.id;
  addGroupBtn.textContent = "+ Group";

  header.append(modeLabel, modeSelect, addRuleBtn, addGroupBtn);

  if (!isRoot) {
    const removeGroupBtn = document.createElement("button");
    removeGroupBtn.type = "button";
    removeGroupBtn.className = "mini-btn danger";
    removeGroupBtn.dataset.action = "remove-group";
    removeGroupBtn.dataset.groupId = group.id;
    removeGroupBtn.textContent = "Remove group";
    header.appendChild(removeGroupBtn);
  }

  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "filter-group-body";

  for (const child of group.children) {
    if (child.type === "group") {
      body.appendChild(renderFilterGroup(child, depth + 1, false));
      continue;
    }

    const row = document.createElement("div");
    row.className = "filter-rule-row";
    row.dataset.ruleId = child.id;

    const fieldSelect = document.createElement("select");
    fieldSelect.dataset.action = "set-rule-field";
    fieldSelect.dataset.ruleId = child.id;
    fieldSelect.className = "rule-select field-select";
    for (const field of fieldRegistry) {
      const option = document.createElement("option");
      option.value = field.key;
      option.textContent = field.label;
      fieldSelect.appendChild(option);
    }
    fieldSelect.value = child.fieldKey || fieldRegistry[0]?.key || "";

    const selectedField = fieldRegistry.find((field) => field.key === fieldSelect.value) || fieldRegistry[0];
    const validOperators = operatorsForType(selectedField?.type || "text");
    if (!validOperators.some(([value]) => value === child.operator)) {
      child.operator = defaultOperatorForType(selectedField?.type || "text");
    }

    const opSelect = document.createElement("select");
    opSelect.dataset.action = "set-rule-operator";
    opSelect.dataset.ruleId = child.id;
    opSelect.className = "rule-select op-select";
    for (const [opValue, opLabel] of validOperators) {
      const option = document.createElement("option");
      option.value = opValue;
      option.textContent = opLabel;
      opSelect.appendChild(option);
    }
    opSelect.value = child.operator;

    row.append(fieldSelect, opSelect);

    if (operatorNeedsValue(child.operator)) {
      if (selectedField?.type === "number") {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.className = "rule-value-input";
        input.placeholder = "Value";
        input.value = child.value ?? "";
        input.dataset.action = "set-rule-value";
        input.dataset.ruleId = child.id;
        row.appendChild(input);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "rule-value-input";
        input.placeholder = "Value";
        input.value = child.value ?? "";
        input.dataset.action = "set-rule-value";
        input.dataset.ruleId = child.id;
        row.appendChild(input);
      }
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mini-btn danger";
    removeBtn.dataset.action = "remove-rule";
    removeBtn.dataset.ruleId = child.id;
    removeBtn.textContent = "Remove";
    row.appendChild(removeBtn);

    body.appendChild(row);
  }

  if (group.children.length === 0) {
    const empty = document.createElement("p");
    empty.className = "filter-empty";
    empty.textContent = "No filters in this group.";
    body.appendChild(empty);
  }

  wrapper.appendChild(body);
  return wrapper;
}

function renderFilterBuilder() {
  filterBuilderEl.innerHTML = "";
  filterBuilderEl.appendChild(renderFilterGroup(filterTree, 0, true));
}

function showEmptyState(message) {
  roomList.innerHTML = `<div class="empty-state">${message}</div>`;
  resultCount.textContent = "Showing 0 room types.";
}

function renderRooms(rooms) {
  roomList.innerHTML = "";
  if (!rooms.length) {
    showEmptyState("No matching rooms found.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const room of sortedRoomsForRender(rooms)) {
    const card = roomCardTemplate.content.firstElementChild.cloneNode(true);
    const titleEl = card.querySelector(".room-title");
    const keyEl = card.querySelector(".room-key");
    const pinBtnEl = card.querySelector(".pin-btn");
    const attributeListEl = card.querySelector(".attribute-list");
    const tagContainerEl = card.querySelector(".behavior-tags");
    const behaviorListEl = card.querySelector(".behavior-list");
    const tagsSection = card.querySelector(".room-tags-section");
    const behaviorsSection = card.querySelector(".room-behaviors-section");

    titleEl.textContent = roomDisplayName(room);
    keyEl.textContent = room.room_type;
    pinBtnEl.dataset.roomType = room.room_type;
    const isPinned = pinnedRoomTypes.has(room.room_type);
    pinBtnEl.setAttribute("aria-pressed", String(isPinned));
    pinBtnEl.textContent = isPinned ? "Pinned" : "Pin";

    let renderedAttributeCount = 0;
    for (const [key, value] of Object.entries(room.base_attributes || {})) {
      const isInspectorVisible = inspectorVisibleAttributeKeys.has(key);
      if (attributeVisibilityMode === "inspector" && !isInspectorVisible) {
        continue;
      }

      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = formatValue(value);
      if (!isInspectorVisible) {
        dt.classList.add("attribute-blackboxed");
        dd.classList.add("attribute-blackboxed");
      }
      attributeListEl.append(dt, dd);
      renderedAttributeCount += 1;
    }

    if (renderedAttributeCount === 0) {
      const note = document.createElement("div");
      note.className = "attribute-empty";
      note.textContent = "No inspector-visible attributes for this room.";
      attributeListEl.appendChild(note);
    }

    if (attributeVisibilityMode === "inspector") {
      tagsSection.style.display = "none";
      behaviorsSection.style.display = "none";
    } else {
      const tags = room.behavior_tags || [];
      if (!tags.length) {
        tagsSection.style.display = "none";
      } else {
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "tag-chip";
          chip.textContent = tag;
          tagContainerEl.appendChild(chip);
        }
      }

      const behaviors = room.unique_behaviors || [];
      if (!behaviors.length) {
        behaviorsSection.style.display = "none";
      } else {
        for (const behavior of behaviors) {
          const li = document.createElement("li");
          li.textContent = behavior;
          behaviorListEl.appendChild(li);
        }
      }
    }

    fragment.appendChild(card);
  }

  roomList.appendChild(fragment);
  const pinnedCount = rooms.filter((room) => pinnedRoomTypes.has(room.room_type)).length;
  resultCount.textContent = `Showing ${rooms.length} room type${rooms.length === 1 ? "" : "s"} (${pinnedCount} pinned).`;
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allRooms.filter((room) => {
    if (query && !room._searchText.includes(query)) return false;
    return evaluateFilterNode(filterTree, room);
  });
  renderRooms(filtered);
}

function findNodeAndParent(targetId, node = filterTree, parent = null) {
  if (node.id === targetId) return { node, parent };
  if (node.type !== "group") return null;
  for (const child of node.children) {
    const found = findNodeAndParent(targetId, child, node);
    if (found) return found;
  }
  return null;
}

function handleFilterBuilderClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, groupId, ruleId } = button.dataset;

  if (action === "add-rule" && groupId) {
    const found = findNodeAndParent(groupId);
    if (!found || found.node.type !== "group") return;
    const fieldKey = fieldRegistry[0]?.key || "";
    found.node.children.push(createRule(fieldKey));
    renderFilterBuilder();
    applyFilters();
    return;
  }

  if (action === "add-group" && groupId) {
    const found = findNodeAndParent(groupId);
    if (!found || found.node.type !== "group") return;
    found.node.children.push(createGroup());
    renderFilterBuilder();
    applyFilters();
    return;
  }

  if (action === "remove-group" && groupId) {
    const found = findNodeAndParent(groupId);
    if (!found || !found.parent || found.parent.type !== "group") return;
    found.parent.children = found.parent.children.filter((child) => child.id !== groupId);
    renderFilterBuilder();
    applyFilters();
    return;
  }

  if (action === "remove-rule" && ruleId) {
    const found = findNodeAndParent(ruleId);
    if (!found || !found.parent || found.parent.type !== "group") return;
    found.parent.children = found.parent.children.filter((child) => child.id !== ruleId);
    renderFilterBuilder();
    applyFilters();
  }
}

function handleFilterBuilderChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;

  if (action === "set-group-mode") {
    const found = findNodeAndParent(target.dataset.groupId);
    if (!found || found.node.type !== "group") return;
    found.node.mode = target.value === "or" ? "or" : "and";
    applyFilters();
    return;
  }

  if (action === "set-rule-field") {
    const found = findNodeAndParent(target.dataset.ruleId);
    if (!found || found.node.type !== "rule") return;
    found.node.fieldKey = target.value;
    const field = fieldRegistry.find((item) => item.key === target.value);
    found.node.operator = defaultOperatorForType(field?.type || "text");
    found.node.value = "";
    renderFilterBuilder();
    applyFilters();
    return;
  }

  if (action === "set-rule-operator") {
    const found = findNodeAndParent(target.dataset.ruleId);
    if (!found || found.node.type !== "rule") return;
    found.node.operator = target.value;
    if (!operatorNeedsValue(found.node.operator)) {
      found.node.value = "";
    }
    renderFilterBuilder();
    applyFilters();
    return;
  }

  if (action === "set-rule-value") {
    const found = findNodeAndParent(target.dataset.ruleId);
    if (!found || found.node.type !== "rule") return;
    found.node.value = target.value;
    applyFilters();
  }
}

function loadFromObject(jsonObject) {
  allRooms = normalizeData(jsonObject);
  inspectorVisibleAttributeKeys = buildInspectorVisibleKeys(jsonObject);
  fieldRegistry = buildFieldRegistry(allRooms);
  filterTree = makeDefaultFilterTree();
  renderFilterBuilder();
  applyFilters();
}

async function tryLoadLocalDefault() {
  try {
    const response = await fetch("./room_types.json");
    if (!response.ok) {
      showEmptyState("Could not auto-load room_types.json.");
      return;
    }
    const data = await response.json();
    loadFromObject(data);
  } catch {
    showEmptyState("Could not auto-load room_types.json.");
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    loadFromObject(JSON.parse(text));
  } catch (error) {
    showEmptyState(`Unable to parse JSON: ${error.message}`);
  }
});

searchInput.addEventListener("input", applyFilters);
filterBuilderEl.addEventListener("click", handleFilterBuilderClick);
filterBuilderEl.addEventListener("change", handleFilterBuilderChange);
filterBuilderEl.addEventListener("input", handleFilterBuilderChange);

resetFilterBuilderBtn.addEventListener("click", () => {
  filterTree = makeDefaultFilterTree();
  renderFilterBuilder();
  applyFilters();
});

attributeModeToggleBtn.addEventListener("click", () => {
  attributeVisibilityMode = attributeVisibilityMode === "inspector" ? "all" : "inspector";
  updateAttributeToggleButtonLabel();
  persistAttributeModeState();
  applyFilters();
});

roomList.addEventListener("click", (event) => {
  const button = event.target.closest(".pin-btn");
  if (!button) return;
  const roomType = button.dataset.roomType;
  if (!roomType) return;
  if (pinnedRoomTypes.has(roomType)) {
    pinnedRoomTypes.delete(roomType);
  } else {
    pinnedRoomTypes.add(roomType);
  }
  persistPinnedState();
  applyFilters();
});

loadPinnedState();
loadAttributeModeState();
tryLoadLocalDefault();
