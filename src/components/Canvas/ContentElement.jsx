import React, { useState } from 'react';
import { ELEMENT_TYPES } from '../../data/elementCatalog';
import { useEditor } from '../../state/EditorContext';
import { rotatedBoundingBox, snapRotation } from '../../utils/geometry';

function partInlineStyle(style, part, fallbackColor) {
  const s = (style && style[part]) || {};
  return {
    color: s.textColor || fallbackColor,
    background: s.bgColor,
    borderColor: s.borderColor,
    borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
    borderStyle: s.borderWidth ? 'solid' : undefined,
  };
}

function ElementBody({ type, style, isPartSelected, onSelectPart }) {
  const def = ELEMENT_TYPES[type];
  const data = def.render();

  switch (def.variant) {
    case 'text':
      return <div className="c-element__text">{data}</div>;
    case 'block': {
      const titleStyle = partInlineStyle(style, 'title', '#a2896b');
      const bodyStyle = partInlineStyle(style, 'body', '#55524a');
      return (
        <div className="c-element__block">
          <div
            className={`c-block__title${isPartSelected('title') ? ' c-block__title--selected' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
          >
            {data[0]}
          </div>
          {data.slice(1).map((line, i) => (
            <div
              className={`c-block__line${isPartSelected('body') ? ' c-block__line--selected' : ''}`}
              style={bodyStyle}
              key={i}
              onClick={(e) => onSelectPart(e, 'body')}
            >
              {line}
            </div>
          ))}
        </div>
      );
    }
    case 'row':
      return (
        <div className="c-element__row">
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'row-strong':
      return (
        <div className="c-element__row c-element__row--strong">
          <span>{data[0]}</span><span>{data[1]}</span>
        </div>
      );
    case 'note':
      return <div className="c-element__text" style={{ opacity: 0.6 }}>{data}</div>;
    case 'image':
      return (
        <div
          className="c-element__image-placeholder"
          style={{
            background: style.bgColor || '#eee5d0',
            color: style.textColor || '#a2896b',
            borderColor: style.borderWidth ? style.borderColor : '#c9b98f',
            borderWidth: style.borderWidth ? `${style.borderWidth}px` : '1px',
            borderStyle: style.borderWidth ? 'solid' : 'dashed',
          }}
        >
          {data.placeholder}
        </div>
      );
    case 'qr': {
      const titleStyle = partInlineStyle(style, 'title', '#a2896b');
      const bodyStyle = partInlineStyle(style, 'body', '#55524a');
      return (
        <div className="c-element__block">
          <div
            className={`c-block__title${isPartSelected('title') ? ' c-block__title--selected' : ''}`}
            style={titleStyle}
            onClick={(e) => onSelectPart(e, 'title')}
          >
            {data.label}
          </div>
          <div
            className={`c-block__line${isPartSelected('body') ? ' c-block__line--selected' : ''}`}
            style={bodyStyle}
            onClick={(e) => onSelectPart(e, 'body')}
          >
            {data.link}
          </div>
        </div>
      );
    }
    case 'table':
      return (
        <table className="c-element__table">
          <thead>
            <tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return null;
  }
}

// IMPORTANT: resize/rotate must produce exactly ONE undo step per gesture,
// same rule as ShapeElement — local live state while dragging, single
// `updateElementStyle` commit on mouseup.
export default function ContentElement({ type, region, index }) {
  const { selection, setSelection, template, updateElementStyle } = useEditor();
  const def = ELEMENT_TYPES[type];
  const style = template.elementStyles[type] || {};

  const isSelected = selection.type === 'content' && selection.ids.includes(type);
  const isWholeSelected = isSelected && !selection.part;
  const isPartSelected = (part) =>
    selection.type === 'content' && selection.ids[0] === type && selection.part === part;

  const [live, setLive] = useState(null); // { width, height, rotation } while dragging
  const [rotationSnapped, setRotationSnapped] = useState(false);

  const current = { ...style, ...(live || {}) };
  const rotation = current.rotation || 0;

  // Reserve extra footprint when rotated so neighbors in the same slot
  // never get visually clipped or overlapped — based on the element's
  // actual explicit size when one has been set via the resize handle.
  const bbox = rotation
    ? rotatedBoundingBox(current.width || 160, current.height || 40, rotation)
    : null;

  // Table and locked elements (e.g. the footer wordmark) are structurally
  // fixed — no free-form resize or rotate.
  const canTransform = def.variant !== 'table' && !def.locked;

  const handleClick = (e) => {
    e.stopPropagation();
    if (e.shiftKey && selection.type === 'content') {
      const ids = selection.ids.includes(type)
        ? selection.ids.filter((t) => t !== type)
        : [...selection.ids, type];
      setSelection({ type: 'content', ids });
    } else {
      setSelection({ type: 'content', ids: [type] });
    }
  };

  const handleSelectPart = (e, part) => {
    e.stopPropagation();
    setSelection({ type: 'content', ids: [type], part });
  };

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/element-type', type);
    e.dataTransfer.setData('text/from-region', region);
    e.dataTransfer.setData('text/from-index', String(index));
  };

  const beginResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: style.width || rect.width, h: style.height || rect.height };
    let finalSize = null;

    const onMove = (ev) => {
      finalSize = {
        width: Math.max(16, start.w + (ev.clientX - start.x)),
        height: Math.max(12, start.h + (ev.clientY - start.y)),
      };
      setLive(finalSize);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalSize) updateElementStyle(type, finalSize);
      setLive(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const beginRotate = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let finalRotation = null;

    const onMove = (ev) => {
      const raw = Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90);
      const { value, snapped } = snapRotation(raw);
      finalRotation = { rotation: value };
      setRotationSnapped(snapped);
      setLive(finalRotation);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (finalRotation) updateElementStyle(type, finalRotation);
      setLive(null);
      setRotationSnapped(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`c-element c-element--${def.variant}${isSelected ? ' c-element--selected' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        minHeight: bbox ? bbox.height : undefined,
        minWidth: bbox ? bbox.width : undefined,
        width: current.width ? `${current.width}px` : undefined,
        height: current.height ? `${current.height}px` : undefined,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth ? `${style.borderWidth}px` : undefined,
        borderStyle: style.borderWidth ? 'solid' : undefined,
        color: style.textColor,
        background: style.bgColor,
      }}
    >
      <ElementBody type={type} style={style} isPartSelected={isPartSelected} onSelectPart={handleSelectPart} />
      {isWholeSelected && canTransform && (
        <>
          <div className="c-element__resize-handle" onMouseDown={beginResize} />
          <div
            className={`c-element__rotate-handle${rotationSnapped ? ' c-element__rotate-handle--snapped' : ''}`}
            onMouseDown={beginRotate}
          />
        </>
      )}
    </div>
  );
}
