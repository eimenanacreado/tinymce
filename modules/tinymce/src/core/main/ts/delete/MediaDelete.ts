/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Node } from '@ephox/dom-globals';
import { Option } from '@ephox/katamari';
import { Element } from '@ephox/sugar';
import Editor from '../api/Editor';
import { isBeforeMedia, isAfterMedia } from '../caret/CaretPositionPredicates';
import * as CaretUtils from '../caret/CaretUtils';
import { HDirection } from '../caret/CaretWalker';
import * as NodeType from '../dom/NodeType';
import * as InlineUtils from '../keyboard/InlineUtils';
import * as DeleteElement from './DeleteElement';

const deleteElement = (editor: Editor, forward: boolean, element: Node) => {
  editor._selectionOverrides.hideFakeCaret();
  DeleteElement.deleteElement(editor, forward, Element.fromDom(element));
  return true;
};

const deleteCaret = (editor: Editor, forward: boolean): boolean => {
  const isNearMedia = forward ? isBeforeMedia : isAfterMedia;
  const direction = forward ? HDirection.Forwards : HDirection.Backwards;
  const fromPos = CaretUtils.getNormalizedRangeEndPoint(direction, editor.getBody(), editor.selection.getRng());

  if (isNearMedia(fromPos)) {
    return deleteElement(editor, forward, fromPos.getNode(!forward));
  } else {
    return Option.from(InlineUtils.normalizePosition(forward, fromPos))
      .filter((pos) => isNearMedia(pos) && CaretUtils.isMoveInsideSameBlock(fromPos, pos))
      .map((pos) => deleteElement(editor, forward, pos.getNode(!forward)))
      .getOr(false);
  }
};

const deleteRange = (editor: Editor, forward: boolean) => {
  const selectedNode = editor.selection.getNode();
  return NodeType.isMedia(selectedNode) ? deleteElement(editor, forward, selectedNode) : false;
};

const backspaceDelete = (editor: Editor, forward: boolean): boolean =>
  editor.selection.isCollapsed() ? deleteCaret(editor, forward) : deleteRange(editor, forward);

export {
  backspaceDelete
};
