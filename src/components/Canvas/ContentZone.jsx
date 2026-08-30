import React, { useState } from 'react';
import { REGIONS, ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';
import ContentElement from './ContentElement';

export default function ContentZone({ region }) {
  const { template, reorderInSlot, moveElementToRegion } = useEditor();
  const list = template.slots[region] || [];
  const regionDef = REGIONS[region];
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragOver = (e, hoverIndex) => {
    e.preventDefault();
    setDragOverIndex(hoverIndex);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/element-type');
    const fromRegion = e.dataTransfer.getData('text/from-region');
    const fromIndex = Number(e.dataTransfer.getData('text/from-index'));
    setDragOverIndex(null);

    if (!type) return;

    // Table region is locked — nothing else may be dropped in, and the
    // table itself never leaves it.
    if (regionDef.locked) return;
    const def = ELEMENT_TYPES[type];
    if (def.region !== region && def.locked) return; // e.g. wordmark can't leave footer

    if (fromRegion === region) {
      if (fromIndex !== dropIndex) reorderInSlot(region, fromIndex, dropIndex);
    } else {
      moveElementToRegion(type, fromRegion, region, dropIndex);
    }
  };

  return (
    <div
      className={`region region--${region}`}
      onDragLeave={() => setDragOverIndex(null)}
    >
      <div
        className={`slot${list.length ? ' slot--has-items' : ''}${dragOverIndex !== null ? ' slot--drag-target' : ''}`}
        onDragOver={(e) => handleDragOver(e, list.length)}
        onDrop={(e) => handleDrop(e, list.length)}
      >
        {list.map((type, index) => (
          <React.Fragment key={type}>
            {dragOverIndex === index && <div className="insertion-line" />}
            <div
              className="slot-item"
              onDragOver={(e) => {
                e.stopPropagation();
                handleDragOver(e, index);
              }}
              onDrop={(e) => {
                e.stopPropagation();
                handleDrop(e, index);
              }}
            >
              <ContentElement type={type} region={region} index={index} />
            </div>
          </React.Fragment>
        ))}
        {dragOverIndex === list.length && <div className="insertion-line" />}
      </div>
    </div>
  );
}
