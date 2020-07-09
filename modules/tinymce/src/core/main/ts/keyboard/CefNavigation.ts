/**
 * Copyright (c) Tiny Technologies, Inc. All rights reserved.
 * Licensed under the LGPL or a commercial license.
 * For LGPL see License.txt in the project root for license information.
 * For commercial licenses see https://www.tiny.cloud/
 */

import { Element, Range } from '@ephox/dom-globals';
import { Fun } from '@ephox/katamari';
import Editor from '../api/Editor';
import Env from '../api/Env';
import * as Settings from '../api/Settings';
import CaretPosition from '../caret/CaretPosition';
import { isAfterContentEditableFalse, isAfterTable, isBeforeContentEditableFalse, isBeforeTable } from '../caret/CaretPositionPredicates';
import * as CaretUtils from '../caret/CaretUtils';
import { CaretWalker, HDirection } from '../caret/CaretWalker';
import * as LineWalker from '../caret/LineWalker';
import * as NodeType from '../dom/NodeType';
import * as NavigationUtils from './NavigationUtils';

const isContentEditableFalse = NodeType.isContentEditableFalse;

const moveToCeFalseHorizontally = (direction: HDirection, editor: Editor, range: Range): Range | null =>
  NavigationUtils.moveHorizontally(editor, direction, range, isBeforeContentEditableFalse, isAfterContentEditableFalse, isContentEditableFalse);

const moveToCeFalseVertically = (direction: LineWalker.VDirection, editor: Editor, range: Range) => {
  const isBefore = (caretPosition: CaretPosition) => isBeforeContentEditableFalse(caretPosition) || isBeforeTable(caretPosition);
  const isAfter = (caretPosition: CaretPosition) => isAfterContentEditableFalse(caretPosition) || isAfterTable(caretPosition);
  return NavigationUtils.moveVertically(editor, direction, range, isBefore, isAfter, isContentEditableFalse);
};

const createTextBlock = (editor: Editor): Element => {
  const textBlock = editor.dom.create(Settings.getForcedRootBlock(editor));

  if (!Env.ie || Env.ie >= 11) {
    textBlock.innerHTML = '<br data-mce-bogus="1">';
  }

  return textBlock;
};

const exitPreBlock = (editor: Editor, direction: HDirection, range: Range): void => {
  let pre, caretPos, newBlock;
  const caretWalker = CaretWalker(editor.getBody());
  const getNextVisualCaretPosition = Fun.curry(CaretUtils.getVisualCaretPosition, caretWalker.next);
  const getPrevVisualCaretPosition = Fun.curry(CaretUtils.getVisualCaretPosition, caretWalker.prev);

  if (range.collapsed && Settings.hasForcedRootBlock(editor)) {
    pre = editor.dom.getParent(range.startContainer, 'PRE');
    if (!pre) {
      return;
    }

    if (direction === 1) {
      caretPos = getNextVisualCaretPosition(CaretPosition.fromRangeStart(range));
    } else {
      caretPos = getPrevVisualCaretPosition(CaretPosition.fromRangeStart(range));
    }

    if (!caretPos) {
      newBlock = createTextBlock(editor);

      if (direction === 1) {
        editor.$(pre).after(newBlock);
      } else {
        editor.$(pre).before(newBlock);
      }

      editor.selection.select(newBlock, true);
      editor.selection.collapse();
    }
  }
};

const getHorizontalRange = (editor: Editor, forward: boolean): Range => {
  const direction = forward ? HDirection.Forwards : HDirection.Backwards;
  const range = editor.selection.getRng();

  const newRange: Range = moveToCeFalseHorizontally(direction, editor, range);
  if (newRange) {
    return newRange;
  }

  exitPreBlock(editor, direction, range);
  return null;
};

const getVerticalRange = (editor: Editor, down: boolean): Range => {
  const direction = down ? 1 : -1;
  const range = editor.selection.getRng();

  const newRange = moveToCeFalseVertically(direction, editor, range);
  if (newRange) {
    return newRange;
  }

  exitPreBlock(editor, direction, range);
  return null;
};

const moveH = (editor: Editor, forward: boolean) => () => {
  const newRng = getHorizontalRange(editor, forward);

  if (newRng) {
    NavigationUtils.moveToRange(editor, newRng);
    return true;
  } else {
    return false;
  }
};

const moveV = (editor: Editor, down: boolean) => () => {
  const newRng = getVerticalRange(editor, down);

  if (newRng) {
    NavigationUtils.moveToRange(editor, newRng);
    return true;
  } else {
    return false;
  }
};

const moveToLineEndPoint = (editor: Editor, forward: boolean) => () => {
  const isCefPosition = forward ? isAfterContentEditableFalse : isBeforeContentEditableFalse;
  return NavigationUtils.moveToLineEndPoint(editor, forward, isCefPosition);
};

export {
  moveH,
  moveV,
  moveToLineEndPoint
};
