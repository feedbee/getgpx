export const emptyPoiSelection = Object.freeze({
  hoveredIndex: null,
  pinnedIndex: null,
  returnPointIndex: null,
});

export function updatePoiSelection(state, { type, index = null, currentPointIndex = null }) {
  if (type === 'hover') {
    if (state.pinnedIndex !== null) return state;
    return {
      ...state,
      hoveredIndex: index,
      returnPointIndex: state.returnPointIndex ?? currentPointIndex,
    };
  }
  if (type === 'leave') {
    if (state.pinnedIndex !== null) return state;
    return { ...emptyPoiSelection };
  }
  if (type === 'toggle') {
    if (state.pinnedIndex === index) return { ...emptyPoiSelection };
    return {
      hoveredIndex: null,
      pinnedIndex: index,
      returnPointIndex: state.returnPointIndex ?? currentPointIndex,
    };
  }
  return state;
}
