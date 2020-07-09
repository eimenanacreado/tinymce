/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import Editor from '../api/Editor';
import { isAfterMedia, isBeforeMedia } from '../caret/CaretPositionPredicates';
import { HDirection } from '../caret/CaretWalker';
import * as NodeType from '../dom/NodeType';
import * as NavigationUtils from './NavigationUtils';

const moveH = (editor: Editor, forward: boolean) => () => {
  const direction = forward ? HDirection.Forwards : HDirection.Backwards;
  const range = editor.selection.getRng();

  const newRange = NavigationUtils.moveHorizontally(editor, direction, range, isBeforeMedia, isAfterMedia, NodeType.isMedia);
  if (newRange) {
    NavigationUtils.moveToRange(editor, newRange);
    return true;
  } else {
    return false;
  }
};

const moveV = (editor: Editor, down: boolean) => () => {
  const direction = down ? 1 : -1;
  const range = editor.selection.getRng();

  const newRange = NavigationUtils.moveVertically(editor, direction, range, isBeforeMedia, isAfterMedia, NodeType.isMedia);
  if (newRange) {
    NavigationUtils.moveToRange(editor, newRange);
    return true;
  } else {
    return false;
  }
};

const moveToLineEndPoint = (editor: Editor, forward: boolean) => () => {
  const isNearMedia = forward ? isAfterMedia : isBeforeMedia;
  return NavigationUtils.moveToLineEndPoint(editor, forward, isNearMedia);
};

export {
  moveH,
  moveV,
  moveToLineEndPoint
};
